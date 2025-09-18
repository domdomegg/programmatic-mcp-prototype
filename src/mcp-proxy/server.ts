import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { CodeGenerator } from '../codegen/generator.js';
import type { ServerConfig, Config } from '../../config/servers.js';
import Anthropic from '@anthropic-ai/sdk';

export class MCPProxyServer {
  private server: Server;
  private clients: Map<string, Client> = new Map();
  private tools: Map<string, Tool> = new Map();
  private codegen: CodeGenerator;
  private anthropicClient: Anthropic;

  constructor(private config: Config) {
    this.server = new Server(
      {
        name: 'mcp-proxy',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.codegen = new CodeGenerator(config.paths);
    this.anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  async initialize() {
    console.log('Starting MCP client...');
    this.setupHandlers();
    await this.server.connect(new StdioServerTransport());
    await this.connectBackendServers();
    await this.generateToolBindings();
    console.log('MCP client set up ✓');
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: Array.from(this.tools.values()),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      return this.handleToolCall(request.params.name, request.params.arguments);
    });
  }

  async connectBackendServers() {
    for (const serverConfig of this.config.servers) {
      try {
        // Validate server name doesn't contain __
        if (serverConfig.name.includes('__')) {
          throw new Error(`Server name "${serverConfig.name}" cannot contain "__"`);
        }

        const client = new Client(
          {
            name: `proxy-client-${serverConfig.name}`,
            version: '1.0.0',
          },
          {
            capabilities: {},
          }
        );

        let transport;
        if ('url' in serverConfig) {
          const url = new URL(serverConfig.url);

          // Try StreamableHTTP first, fallback to SSE
          try {
            transport = new StreamableHTTPClientTransport(url);
            await client.connect(transport);
          } catch (error) {
            console.error(`StreamableHTTP failed for ${serverConfig.name}, falling back to SSE:`, error);
            transport = new SSEClientTransport(url);
            await client.connect(transport);
          }
        } else {
          transport = new StdioClientTransport({
            command: serverConfig.command,
            args: serverConfig.args,
            stderr: 'ignore',
          });
          await client.connect(transport);
        }

        this.clients.set(serverConfig.name, client);

        const { tools } = await client.listTools();

        for (const tool of tools) {
          const namespacedName = `${serverConfig.name}__${tool.name}`;
          this.tools.set(namespacedName, {
            ...tool,
            name: namespacedName,
            description: `[${serverConfig.name}] ${tool.description}`,
          });
        }

        console.error(`Connected to ${serverConfig.name} with ${tools.length} tools`);
      } catch (error) {
        console.error(`Failed to connect to ${serverConfig.name}:`, error);
      }
    }
  }

  async handleToolCall(name: string, args: any): Promise<CallToolResult> {
    // Handle meta-tools
    if (name === 'search_tools') {
      return this.handleSearchTools(args);
    }
    if (name === 'list_tool_names') {
      return this.handleListToolNames(args);
    }
    if (name === 'get_tool_definition') {
      return this.handleGetToolDefinition(args);
    }
    if (name === 'execute_tool') {
      return this.handleExecuteTool(args);
    }

    // Handle direct tool calls - delegate to handleExecuteTool
    return this.handleExecuteTool({ tool_name: name, arguments: args });
  }

  private async handleSearchTools(args: any): Promise<CallToolResult> {
    const query = args.query?.toLowerCase() || '';
    const serverFilter = args.server;
    const limit = args.limit;

    let tools = Array.from(this.tools.values());

    // Filter by server if specified
    if (serverFilter) {
      tools = tools.filter(tool => tool.name.startsWith(`${serverFilter}__`));
    }

    // Use subagent to select relevant tools
    const selectedToolNames = await this.selectToolsWithSubagent(query, serverFilter, tools);

    // Get the full tool definitions for selected tools
    const selectedTools = tools.filter(tool => selectedToolNames.includes(tool.name));

    // Apply limit if specified
    const finalTools = limit ? selectedTools.slice(0, limit) : selectedTools;

    const result = {
      total: finalTools.length,
      tools: finalTools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  private async selectToolsWithSubagent(query: string, serverFilter: string | undefined, tools: Tool[]): Promise<string[]> {
    const toolList = tools.map(tool => ({
      name: tool.name,
      description: tool.description,
    }));

    const prompt = `You are a tool selection assistant. Your job is to analyze a list of available tools and select the ones that are most relevant to the user's query.

User query: "${query || 'all tools'}"${serverFilter ? `\nServer filter: "${serverFilter}"` : ''}

Available tools:
${JSON.stringify(toolList, null, 2)}

Please analyze the tools and return ONLY a JSON array of tool names that are relevant to the query. If the query is empty or "all tools", return all tool names.

Your response must be ONLY a valid JSON array of strings, nothing else. For example:
["tool1", "tool2", "tool3"]`;

    try {
      const response = await this.anthropicClient.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      });

      const textContent = response.content.find(c => c.type === 'text');
      if (textContent && textContent.type === 'text') {
        const parsed = JSON.parse(textContent.text);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }

      // Fallback: return all tool names if parsing fails
      return tools.map(t => t.name);
    } catch (error) {
      console.error('Error in subagent tool selection:', error);
      // Fallback: return all tool names
      return tools.map(t => t.name);
    }
  }

  private handleListToolNames(args: any): CallToolResult {
    const serverFilter = args.server;
    const keywords = args.keywords || [];
    const limit = args.limit ?? 100;
    let tools = Array.from(this.tools.values());

    // Filter by server if specified
    if (serverFilter) {
      tools = tools.filter(tool => tool.name.startsWith(`${serverFilter}__`));
    }

    // Filter by keywords if specified
    if (keywords.length > 0) {
      tools = tools.filter(tool => {
        const toolString = JSON.stringify({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        }).toLowerCase();
        return keywords.some((keyword: string) => toolString.includes(keyword.toLowerCase()));
      });
    }

    // Apply limit
    const limitedTools = tools.slice(0, limit);
    const toolNames = limitedTools.map(tool => tool.name);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            tool_names: toolNames,
            total: tools.length,
            returned: toolNames.length,
            truncated: tools.length > limit
          }, null, 2),
        },
      ],
    };
  }

  private handleGetToolDefinition(args: any): CallToolResult {
    const toolName = args.tool_name;

    if (!toolName) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: tool_name is required',
          },
        ],
        isError: true,
      };
    }

    const tool = this.tools.get(toolName);

    if (!tool) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: Tool '${toolName}' not found`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          }, null, 2),
        },
      ],
    };
  }

  private async handleExecuteTool(args: any): Promise<CallToolResult> {
    const toolName = args.tool_name;
    const toolArgs = args.arguments || {};

    if (!toolName) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: tool_name is required',
          },
        ],
        isError: true,
      };
    }

    if (!this.tools.has(toolName)) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: Tool '${toolName}' not found. Use search_tools to discover available tools.`,
          },
        ],
        isError: true,
      };
    }

    // Execute the tool by routing through handleToolCall
    // Split on first __ only to handle tool names that contain __
    const firstSeparator = toolName.indexOf('__');
    const serverName = toolName.slice(0, firstSeparator);
    const actualToolName = toolName.slice(firstSeparator + 2);
    const client = this.clients.get(serverName);

    if (!client) {
      return {
        content: [
          {
            type: 'text',
            text: `Server ${serverName} not found`,
          },
        ],
        isError: true,
      };
    }

    try {
      return await client.callTool({ name: actualToolName, arguments: toolArgs }) as CallToolResult;
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error calling ${toolName}: ${error}`,
          },
        ],
        isError: true,
      };
    }
  }

  async generateToolBindings() {
    await this.codegen.generateFromTools(this.tools);
  }

  getToolSchemas(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Returns only the meta-tools (search_tools and execute_tool).
   *
   * This implements a "tool proxy pattern" to work around Claude API limitations:
   * - The Messages API requires all callable tools to be in the tools[] parameter
   * - Large tool sets consume significant context window space
   * - Tools can't be dynamically added/removed during a conversation
   *
   * Solution: Expose only 2 meta-tools that let Claude discover and execute
   * backend tools on-demand, reducing initial context and enabling lazy loading.
   */
  getMetaToolSchemas(): Tool[] {
    return [
      {
        name: 'search_tools',
        description: 'Search for available MCP tools using an AI agent to select the most relevant tools. Returns full tool definitions.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query to match against tool names and descriptions (optional)',
            },
            server: {
              type: 'string',
              description: 'Filter by server name (e.g., "bash", "container") (optional)',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results to return (optional, no default limit)',
            },
          },
        },
      },
      {
        name: 'list_tool_names',
        description: 'List available tool names. Much faster than search_tools when simple filtering might work. Use get_tool_definition to fetch full tool definitions for specific tools.',
        inputSchema: {
          type: 'object',
          properties: {
            server: {
              type: 'string',
              description: 'Filter by server name (e.g., "bash", "container") (optional)',
            },
            keywords: {
              type: 'array',
              description: 'Filter tools by keywords found anywhere in the tool name, description, or schema (optional)',
              items: {
                type: 'string',
              },
            },
            limit: {
              type: 'number',
              description: 'Maximum number of tool names to return (default: 100)',
            },
          },
        },
      },
      {
        name: 'get_tool_definition',
        description: 'Get the full definition (name, description, input schema) for a specific tool.',
        inputSchema: {
          type: 'object',
          properties: {
            tool_name: {
              type: 'string',
              description: 'The full namespaced tool name (e.g., "bash__read_file", "container__execute")',
            },
          },
          required: ['tool_name'],
        },
      },
      {
        name: 'execute_tool',
        description: 'Execute an MCP tool by name. Use list_tool_names, search_tools, or get_tool_definition to discover available tools and their schemas first.',
        inputSchema: {
          type: 'object',
          properties: {
            tool_name: {
              type: 'string',
              description: 'The full namespaced tool name (e.g., "bash__read_file", "container__execute")',
            },
            arguments: {
              type: 'object',
              description: 'The arguments to pass to the tool',
            },
          },
          required: ['tool_name'],
        },
      },
    ];
  }
}
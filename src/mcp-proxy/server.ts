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

export class MCPProxyServer {
  private server: Server;
  private clients: Map<string, Client> = new Map();
  private tools: Map<string, Tool> = new Map();
  private codegen: CodeGenerator;

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
    if (name === 'execute_tool') {
      return this.handleExecuteTool(args);
    }

    // Handle direct tool calls
    const [serverName, toolName] = name.split('__');
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
      const result = await client.callTool({ name: toolName, arguments: args });
      return result;
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error calling ${name}: ${error}`,
          },
        ],
        isError: true,
      };
    }
  }

  private handleSearchTools(args: any): CallToolResult {
    const query = args.query?.toLowerCase() || '';
    const serverFilter = args.server;
    const limit = args.limit || 50;

    let tools = Array.from(this.tools.values());

    // Filter by server if specified
    if (serverFilter) {
      tools = tools.filter(tool => tool.name.startsWith(`${serverFilter}__`));
    }

    // Search by query if specified
    if (query) {
      tools = tools.filter(tool =>
        tool.name.toLowerCase().includes(query) ||
        tool.description?.toLowerCase().includes(query)
      );
    }

    // Apply limit
    tools = tools.slice(0, limit);

    const result = {
      total: tools.length,
      tools: tools.map(tool => ({
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
    const [serverName, actualToolName] = toolName.split('__');
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
      const result = await client.callTool({ name: actualToolName, arguments: toolArgs });
      return result;
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
        description: 'Search for available MCP tools. Use this to discover what tools you can execute.',
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
              description: 'Maximum number of results to return (default: 50)',
            },
          },
        },
      },
      {
        name: 'execute_tool',
        description: 'Execute an MCP tool by name. First use search_tools to discover available tools.',
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
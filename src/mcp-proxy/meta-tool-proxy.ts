import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Config } from '../../config/servers.js';
import Anthropic from '@anthropic-ai/sdk';

/**
 * MetaToolProxy - Provides meta-tools and routing for the agent
 *
 * This handles:
 * - Meta-tools: search_tools, list_tool_names, get_tool_definition
 * - Container execution routing
 * - Tool discovery with AI-powered search
 *
 * Used by AgentCore to provide Claude with tool discovery capabilities
 */
export class MetaToolProxy {
  private anthropicClient: Anthropic;
  private containerClient: Client | null = null;

  constructor(
    private tools: Map<string, Tool>,
    private config: Config
  ) {
    this.anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  setContainerClient(client: Client) {
    this.containerClient = client;
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

    // Handle container execution - route to backend server
    if (name === 'container__execute') {
      if (!this.containerClient) {
        return {
          content: [{ type: 'text', text: 'Container server not available' }],
          isError: true,
        };
      }
      try {
        return await this.containerClient.callTool({ name: 'execute', arguments: args }) as CallToolResult;
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error executing code: ${error}` }],
          isError: true,
        };
      }
    }

    // All other tool execution must go through container__execute with TypeScript code
    return {
      content: [
        {
          type: 'text',
          text: `Error: Direct tool execution is not allowed. You must write TypeScript code using container__execute. Import the tool from the generated bindings and call it in your code.`,
        },
      ],
      isError: true,
    };
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

  /**
   * Returns only the meta-tools for tool discovery and container execution.
   */
  getMetaToolSchemas(): Tool[] {
    // Get the container__execute tool from the actual tools
    const containerExecute = this.tools.get('container__execute');

    const tools: Tool[] = [
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
    ];

    // Add container__execute if it exists
    if (containerExecute) {
      tools.push(containerExecute);
    }

    return tools;
  }
}
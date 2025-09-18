import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
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

        const transport = new StdioClientTransport({
          command: serverConfig.command,
          args: serverConfig.args,
        });

        await client.connect(transport);
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

  async generateToolBindings() {
    await this.codegen.generateFromTools(this.tools);
  }

  getToolSchemas(): Tool[] {
    return Array.from(this.tools.values());
  }
}
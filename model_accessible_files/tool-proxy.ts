import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
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
import type { Config } from './config/servers.js';
import { FileBasedOAuthProvider } from './oauth-provider.js';
import express from 'express';
import type { Express } from 'express';

/**
 * ToolProxy - Simple MCP server that forwards tool calls to backend MCP servers
 *
 * This is a pass-through proxy that:
 * - Connects to backend MCP servers (time, slack, asana, etc.)
 * - Exposes all their tools via MCP protocol
 * - Forwards tool calls to the appropriate backend
 *
 * Used by containers to access MCP tools via Unix socket
 */
export class ToolProxy {
  private server: Server;
  private clients: Map<string, Client> = new Map();
  private tools: Map<string, Tool> = new Map();

  constructor(private config: Config) {
    this.server = new Server(
      {
        name: 'mcp-tool-proxy',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
  }

  async initialize() {
    console.error('Starting Tool Proxy...');
    this.setupHandlers();
    await this.connectBackendServers();
    console.error('Tool Proxy initialized ✓');
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: Array.from(this.tools.values()),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.name;
      const [serverName, ...toolParts] = toolName.split('__');
      const actualToolName = toolParts.join('__');

      const client = this.clients.get(serverName);
      if (!client) {
        return {
          content: [{ type: 'text', text: `Server '${serverName}' not found` }],
          isError: true,
        };
      }

      try {
        return await client.callTool({
          name: actualToolName,
          arguments: request.params.arguments,
        }) as CallToolResult;
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error}` }],
          isError: true,
        };
      }
    });
  }

  async connectBackendServers() {
    for (const serverConfig of this.config.servers) {
      try {
        console.error(`[ToolProxy] Connecting to ${serverConfig.name}...`);

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

          // Create auth provider - it will be used if the server requires OAuth
          const authProvider = new FileBasedOAuthProvider(
            serverConfig.name,
            'http://localhost:3000/oauth/callback'
          );

          // Use specified transport
          if (serverConfig.transport === 'sse') {
            transport = new SSEClientTransport(url, { authProvider });
            try {
              await client.connect(transport);
            } catch (error: any) {
              if (error?.message?.includes('Unauthorized')) {
                console.error(`Completing OAuth flow for ${serverConfig.name}...`);
                const code = await authProvider.getAuthorizationCode();
                await transport.finishAuth(code);
                // Create new transport and reconnect
                transport = new SSEClientTransport(url, { authProvider });
                await client.connect(transport);
              } else {
                throw error;
              }
            }
          } else {
            transport = new StreamableHTTPClientTransport(url, { authProvider });
            try {
              await client.connect(transport);
            } catch (error: any) {
              if (error?.message?.includes('Unauthorized')) {
                console.error(`Completing OAuth flow for ${serverConfig.name}...`);
                const code = await authProvider.getAuthorizationCode();
                await transport.finishAuth(code);
                // Create new transport and reconnect
                transport = new StreamableHTTPClientTransport(url, { authProvider });
                await client.connect(transport);
              } else {
                throw error;
              }
            }
          }
        } else {
          transport = new StdioClientTransport({
            command: serverConfig.command,
            args: serverConfig.args,
            stderr: 'inherit', // Show stderr for debugging
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

        console.error(`[ToolProxy] ✓ Connected to ${serverConfig.name} with ${tools.length} tools`);
      } catch (error) {
        console.error(`[ToolProxy] ✗ Failed to connect to ${serverConfig.name}:`, error instanceof Error ? error.message : error);
      }
    }
  }

  async connectStdio() {
    await this.server.connect(new StdioServerTransport());
    console.error('Tool Proxy listening on stdio');
  }

  async startHttpServer(port: number = 8000): Promise<Express> {
    const app = express();
    app.use(express.json());

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    await this.server.connect(transport);

    // MCP endpoint
    app.post("/mcp", async (req, res) => {
      await transport.handleRequest(req, res, req.body);
    });

    // OAuth callback endpoint
    app.get("/oauth/callback", async (req, res) => {
      const code = req.query.code as string;
      const state = req.query.state as string;
      const error = req.query.error as string;

      if (error) {
        res.status(400).send(`<html><body><h1>Authorization Failed</h1><p>Error: ${error}</p><p>You can close this window.</p></body></html>`);
      } else if (code) {
        res.send('<html><body><h1>Authorization Successful!</h1><p>You can close this window and return to the terminal.</p></body></html>');
      } else {
        res.status(400).send('<html><body><h1>Invalid Request</h1><p>No authorization code received.</p></body></html>');
      }
    });

    app.listen(port, () => {
      console.error(`Tool Proxy HTTP server running on http://localhost:${port}/mcp`);
    });

    return app;
  }

  getTools(): Map<string, Tool> {
    return this.tools;
  }

  getClients(): Map<string, Client> {
    return this.clients;
  }
}
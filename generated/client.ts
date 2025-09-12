import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

let mcpClient: Client | null = null;

export async function getMCPClient(): Promise<Client> {
  if (mcpClient) return mcpClient;

  mcpClient = new Client(
    {
      name: 'codegen-client',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  const transport = new StdioClientTransport({
    command: 'node',
    args: ['./src/index.ts'],
  });

  await mcpClient.connect(transport);
  return mcpClient;
}

export async function callMCPTool(name: string, args: any): Promise<CallToolResult> {
  const client = await getMCPClient();
  return client.callTool({ name, arguments: args });
}
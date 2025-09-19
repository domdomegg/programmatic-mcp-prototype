import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

let mcpClient: Client | null = null;

export async function getMCPClient(): Promise<Client> {
  if (mcpClient) return mcpClient;

  mcpClient = new Client(
    {
      name: 'container-client',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  // Connect to the ToolProxy HTTP server running in the container
  const transport = new StreamableHTTPClientTransport(
    new URL('http://localhost:8000/mcp')
  );

  await mcpClient.connect(transport);
  return mcpClient;
}

export async function callMCPTool<T = unknown>(name: string, args: any): Promise<T> {
  const client = await getMCPClient();
  const result = await client.callTool({ name, arguments: args }) as CallToolResult;

  if (result.isError) {
    throw new Error(`Tool ${name} failed: ${result.content[0]?.text || 'Unknown error'}`);
  }

  if (result.structuredContent) {
    return result.structuredContent as T;
  }

  const textContent = result.content.find(c => c.type === 'text');
  if (textContent && textContent.type === 'text') {
    try {
      return JSON.parse(textContent.text);
    } catch {
      return textContent.text as unknown as T;
    }
  }

  return undefined as unknown as T;
}
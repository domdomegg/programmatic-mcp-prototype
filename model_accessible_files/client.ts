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
    command: 'tsx',
    args: ['./src/index.ts', '--proxy'],
  });

  await mcpClient.connect(transport);
  return mcpClient;
}

export async function callMCPTool<T = any>(name: string, args: any): Promise<T> {
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
      return textContent.text as any;
    }
  }
  
  return undefined as any;
}
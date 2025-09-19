#!/usr/bin/env node
import { CodeGenerator } from './generator.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';

async function main() {
  const configModule = await import('../../config/servers.js');
  const config = configModule.default;

  // Connect to container to get tools
  const client = new Client(
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
    args: ['./src/servers/container-runner/index.ts'],
    stderr: 'ignore',
  });

  await client.connect(transport);

  const toolsResult = await client.callTool({ name: 'list_tools', arguments: {} }) as CallToolResult;
  const tools = (toolsResult.structuredContent as { tools: Tool[] }).tools;
  const toolsMap = new Map(tools.map(t => [t.name, t]));

  const generator = new CodeGenerator(config.paths);
  await generator.generateFromTools(toolsMap);

  console.log('Code generation complete!');
  process.exit(0);
}

main().catch(console.error);
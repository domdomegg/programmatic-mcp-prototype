#!/usr/bin/env node
import { MetaToolProxy } from './mcp-proxy/meta-tool-proxy.js';
import { CLIInterface } from './interfaces/cli.js';
import { HTTPInterface } from './interfaces/http.js';
import { CodeGenerator } from './codegen/generator.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import config from '../model_accessible_files/config/servers.js';
import * as fs from 'fs/promises';

async function main() {
  await fs.mkdir(config.paths.workspace, { recursive: true });
  await fs.mkdir(config.paths.skills, { recursive: true });

  const isHTTPMode = process.argv.includes('--http');

  const containerClient = await connectContainerClient();

  // Get tools from container
  const toolsResult = await containerClient.callTool({ name: 'list_tools', arguments: {} }) as CallToolResult;

  if (toolsResult.isError) {
    const errorText = toolsResult.content.find(c => c.type === 'text');
    console.error('[index] Error getting tools:', errorText && errorText.type === 'text' ? errorText.text : 'Unknown error');
    process.exit(1);
  }

  const tools = (toolsResult.structuredContent as { tools: Tool[] })?.tools;
  if (!tools) {
    console.error('[index] No tools returned from container');
    process.exit(1);
  }

  const toolsMap = new Map(tools.map(t => [t.name, t]));

  // Generate code bindings
  const codegen = new CodeGenerator(config.paths);
  await codegen.generateFromTools(toolsMap);

  const metaToolProxy = new MetaToolProxy(toolsMap, config);
  metaToolProxy.setContainerClient(containerClient);

  if (isHTTPMode) {
    const httpInterface = new HTTPInterface(metaToolProxy, config, Number(process.env.PORT) || 3000);
    await httpInterface.start();

    process.on('SIGINT', () => {
      console.log('\nShutting down...');
      httpInterface.close();
      process.exit(0);
    });
  } else {
    const cliInterface = new CLIInterface(metaToolProxy, config);
    await cliInterface.run();
  }
}

async function connectContainerClient(): Promise<Client> {
  const client = new Client(
    {
      name: 'container-client',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  const transport = new StdioClientTransport({
    command: 'tsx',
    args: ['./src/servers/container-runner/index.ts'],
    stderr: 'inherit', // Show stderr from container runner
  });

  await client.connect(transport);
  return client;
}

main().catch(console.error);
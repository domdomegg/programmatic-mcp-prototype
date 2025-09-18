#!/usr/bin/env node
import { MCPProxyServer } from '../mcp-proxy/server.js';
import { CodeGenerator } from './generator.js';

async function main() {
  const configModule = await import('../../config/servers.js');
  const config = configModule.default;

  const proxy = new MCPProxyServer(config);
  await proxy.initialize();
  
  const tools = proxy.getToolSchemas();
  const toolsMap = new Map();
  tools.forEach(tool => toolsMap.set(tool.name, tool));
  
  const generator = new CodeGenerator(config.paths);
  await generator.generateFromTools(toolsMap);
  
  console.log('Code generation complete!');
  process.exit(0);
}

main().catch(console.error);
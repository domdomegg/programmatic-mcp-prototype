#!/usr/bin/env tsx
/**
 * HTTP API server for interacting with the MCP agent
 */

import { MCPProxyServer } from './src/mcp-proxy/server.js';
import Anthropic from '@anthropic-ai/sdk';
import config from './config/servers.js';
import * as http from 'http';
import { URL } from 'url';

interface Message {
  role: 'user' | 'assistant';
  content: string | any[];
}

class AgentAPI {
  private proxy!: MCPProxyServer;
  private client!: Anthropic;
  private conversation: Message[] = [];

  async initialize() {
    this.proxy = new MCPProxyServer(config);
    await this.proxy.initialize();

    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Initialize conversation with system prompt
    this.conversation.push({
      role: 'user',
      content: `You are an AI assistant with access to tools via MCP. 

IMPORTANT: You have two special directories:
- ${config.paths.workspace}: Use this to store any data, CSVs, files you create during execution
- ${config.paths.skills}: Use this to build reusable TypeScript skills that compose tools

When you want to execute TypeScript code, you can use the container__execute tool.`,
    });
  }

  async processMessage(userMessage: string): Promise<string> {
    this.conversation.push({
      role: 'user',
      content: userMessage,
    });

    let response = '';
    let shouldContinue = true;

    while (shouldContinue) {
      const tools = this.proxy.getToolSchemas();
      
      const claudeResponse = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        messages: this.conversation,
        tools: tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema,
        })),
      });

      this.conversation.push({
        role: 'assistant',
        content: claudeResponse.content,
      });

      if (claudeResponse.stop_reason === 'tool_use') {
        const toolResults = [];
        
        for (const content of claudeResponse.content) {
          if (content.type === 'tool_use') {
            console.log(`[API] Calling tool: ${content.name}`);
            
            try {
              const result = await this.proxy.handleToolCall(
                content.name,
                content.input
              );

              toolResults.push({
                type: 'tool_result',
                tool_use_id: content.id,
                content: result.content,
                is_error: result.isError,
              });

              // Add tool result to response for debugging
              response += `\n[Tool: ${content.name}]\n`;
              if (result.structuredContent) {
                response += JSON.stringify(result.structuredContent, null, 2) + '\n';
              } else if (result.content[0]?.type === 'text') {
                response += result.content[0].text + '\n';
              }
            } catch (error: any) {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: content.id,
                content: [{ type: 'text', text: `Error: ${error.message}` }],
                is_error: true,
              });
            }
          }
        }

        this.conversation.push({
          role: 'user',
          content: toolResults,
        });
      } else {
        shouldContinue = false;
        const textContent = claudeResponse.content.find(c => c.type === 'text');
        if (textContent && textContent.type === 'text') {
          response += '\n' + textContent.text;
        }
      }
    }

    return response.trim();
  }

  getTools() {
    return this.proxy.getToolSchemas();
  }

  async callTool(name: string, args: any) {
    return this.proxy.handleToolCall(name, args);
  }
}

// Create HTTP server
const agent = new AgentAPI();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  try {
    // GET / - API info
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        service: 'MCP Agent API',
        endpoints: {
          'GET /': 'API info',
          'POST /chat': 'Send a message to the agent',
          'GET /tools': 'List available tools',
          'POST /tool': 'Call a specific tool',
          'GET /health': 'Health check'
        }
      }, null, 2));
      return;
    }

    // POST /chat - Send message to agent
    if (req.method === 'POST' && url.pathname === '/chat') {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }
      
      const { message } = JSON.parse(body);
      const response = await agent.processMessage(message);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ response }));
      return;
    }

    // GET /tools - List tools
    if (req.method === 'GET' && url.pathname === '/tools') {
      const tools = agent.getTools();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(tools, null, 2));
      return;
    }

    // POST /tool - Call a tool directly
    if (req.method === 'POST' && url.pathname === '/tool') {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }
      
      const { name, args } = JSON.parse(body);
      const result = await agent.callTool(name, args);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result, null, 2));
      return;
    }

    // GET /health - Health check
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', tools: agent.getTools().length }));
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    
  } catch (error: any) {
    console.error('API Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
});

// Start server
const PORT = process.env.PORT || 3000;

agent.initialize().then(() => {
  server.listen(PORT, () => {
    console.log(`\n🚀 MCP Agent API Server running on http://localhost:${PORT}\n`);
    console.log('Available endpoints:');
    console.log(`  GET  http://localhost:${PORT}/           - API info`);
    console.log(`  POST http://localhost:${PORT}/chat       - Chat with agent`);
    console.log(`  GET  http://localhost:${PORT}/tools      - List tools`);
    console.log(`  POST http://localhost:${PORT}/tool       - Call a tool`);
    console.log(`  GET  http://localhost:${PORT}/health     - Health check`);
    console.log('\nExample curl commands:');
    console.log(`  curl http://localhost:${PORT}/health`);
    console.log(`  curl -X POST http://localhost:${PORT}/chat -H "Content-Type: application/json" -d '{"message":"list files"}'`);
    console.log('\n');
  });
}).catch(console.error);
import { MetaToolProxy } from '../mcp-proxy/meta-tool-proxy.js';
import { AgentCore, type ToolCallInfo } from '../agent/core.js';
import * as http from 'http';
import { URL } from 'url';
import type { Config } from '../../config/servers.js';

export class HTTPInterface {
  private agent!: AgentCore;
  private server!: http.Server;

  constructor(
    private metaToolProxy: MetaToolProxy,
    private config: Config,
    private port: number = 3000
  ) {
    this.agent = new AgentCore(metaToolProxy, config);
  }

  async start() {
    this.server = http.createServer(async (req, res) => {
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
              'GET /conversation': 'Get conversation history',
              'POST /reset': 'Reset conversation'
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
          let toolCalls: any[] = [];
          
          const response = await this.agent.processMessage(
            message,
            (info: ToolCallInfo) => {
              console.log(`[HTTP] Tool called: ${info.name}`);
              toolCalls.push({
                tool: info.name,
                args: info.args,
                result: info.result.structuredContent || info.result.content[0]
              });
            }
          );
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ response, toolCalls }));
          return;
        }

        // GET /conversation - Get history
        if (req.method === 'GET' && url.pathname === '/conversation') {
          const history = this.agent.getConversationHistory();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(history, null, 2));
          return;
        }

        // POST /reset - Reset conversation
        if (req.method === 'POST' && url.pathname === '/reset') {
          this.agent.resetConversation();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'reset' }));
          return;
        }

        // 404
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        
      } catch (error: any) {
        console.error('HTTP Error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });

    return new Promise<void>((resolve) => {
      this.server.listen(this.port, () => {
        console.log(`\n🚀 MCP Agent HTTP API running on http://localhost:${this.port}\n`);
        console.log('Available endpoints:');
        console.log(`  GET  http://localhost:${this.port}/           - API info`);
        console.log(`  POST http://localhost:${this.port}/chat       - Chat with agent`);
        console.log(`  GET  http://localhost:${this.port}/conversation - Get history`);
        console.log(`  POST http://localhost:${this.port}/reset      - Reset conversation`);
        console.log('\nExample:');
        console.log(`  curl -X POST http://localhost:${this.port}/chat -H "Content-Type: application/json" -d '{"message":"list files"}'`);
        console.log('\n');
        resolve();
      });
    });
  }

  close() {
    this.server.close();
  }
}
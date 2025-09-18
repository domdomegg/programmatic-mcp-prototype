import Anthropic from '@anthropic-ai/sdk';
import { MCPProxyServer } from '../mcp-proxy/server.js';
import type { Config } from '../../config/servers.js';

interface Message {
  role: 'user' | 'assistant';
  content: string | any[];
}

export interface ToolCallInfo {
  name: string;
  args: any;
  result: any;
}

export class AgentCore {
  private client: Anthropic;
  private conversation: Message[] = [];

  constructor(
    private proxy: MCPProxyServer,
    private config: Config
  ) {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Initialize conversation with system prompt
    this.conversation.push({
      role: 'user',
      content: `You are an AI assistant with access to tools via MCP.

## Tool Discovery
You have access to two meta-tools:
- search_tools: Search for available tools by query or server name
- execute_tool: Execute any discovered tool by its namespaced name (e.g., "bash__read_file")

IMPORTANT: You must use search_tools to discover what tools are available before using execute_tool.
Tools are namespaced as "server__toolname" (e.g., "bash__list_directory", "container__execute").

## Special Directories
You have two special directories:
- ${this.config.paths.workspace}: Use this to store any data, CSVs, files you create during execution
- ${this.config.paths.skills}: Use this to build reusable TypeScript skills that compose tools

## Creating Reusable Skills
You can create TypeScript files in the skills directory that import and compose tools.
These skills can then be executed using the container__execute tool, allowing you to build
more complex, reusable functionality from basic tools.`,
    });
  }

  async processMessage(userMessage: string, onToolCall?: (info: ToolCallInfo) => void): Promise<string> {
    this.conversation.push({
      role: 'user',
      content: userMessage,
    });

    let response = '';
    let shouldContinue = true;

    while (shouldContinue) {
      const tools = this.proxy.getMetaToolSchemas();
      
      const claudeResponse = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        messages: this.conversation,
        tools: tools.map<Anthropic.Messages.Tool>(tool => ({
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

              // Notify callback about tool execution
              if (onToolCall) {
                onToolCall({
                  name: content.name,
                  args: content.input,
                  result
                });
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
          response = textContent.text;
        }
      }
    }

    return response;
  }

  getToolSchemas() {
    return this.proxy.getMetaToolSchemas();
  }

  async callTool(name: string, args: any) {
    return this.proxy.handleToolCall(name, args);
  }

  getConversationHistory() {
    return this.conversation;
  }

  resetConversation() {
    this.conversation = this.conversation.slice(0, 1); // Keep system prompt
  }
}
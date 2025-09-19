import Anthropic from '@anthropic-ai/sdk';
import { MetaToolProxy } from '../mcp-proxy/meta-tool-proxy.js';
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
    private metaToolProxy: MetaToolProxy,
    private config: Config
  ) {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Initialize conversation with system prompt
    this.conversation.push({
      role: 'user',
      content: `You are an AI assistant with access to tools via MCP.

## Available Tools
You have direct access to these 4 tools:
1. **list_tool_names** - Fast listing of tool names (use get_tool_definition to get schemas)
2. **search_tools** - AI-powered tool discovery (returns full tool definitions)
3. **get_tool_definition** - Get the full schema for a specific tool
4. **container__execute** - Execute TypeScript code in a sandboxed Docker container

## Tool Execution Model
ALL actual tool execution (bash commands, file operations, etc.) must be done by writing TypeScript code that runs in the container.
You CANNOT directly call tools - you must write code that imports and uses the generated tool bindings.

## Workflow
1. **Discover tools** using search_tools, list_tool_names, or get_tool_definition
2. **Write TypeScript code** that imports tools from generated bindings
3. **Execute your code** using container__execute

Example:
\`\`\`typescript
import * as servers from '../generated/index.js';
const result = await servers.time.get_current_time({ timezone: 'Europe/London' });
\`\`\`

## Special Directories
- ${this.config.paths.workspace}: Store any data, CSVs, files you create during execution
- ${this.config.paths.skills}: Build reusable TypeScript skills that compose tools

## Building Skills
You can save TypeScript files to the skills directory.
This allows you to create reusable scripts, which we call 'skills'. You can then call them later with the bash tool with tsx.
These skills can also be imported and composed themselves, enabling complex workflows.`,
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
      const tools = this.metaToolProxy.getMetaToolSchemas();
      
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
              const result = await this.metaToolProxy.handleToolCall(
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
    return this.metaToolProxy.getMetaToolSchemas();
  }

  async callTool(name: string, args: any) {
    return this.metaToolProxy.handleToolCall(name, args);
  }

  getConversationHistory() {
    return this.conversation;
  }

  resetConversation() {
    this.conversation = this.conversation.slice(0, 1); // Keep system prompt
  }
}
import { MetaToolProxy } from '../mcp-proxy/meta-tool-proxy.js';
import { AgentCore, type ToolCallInfo } from '../agent/core.js';
import * as readline from 'readline/promises';
import type { Config } from '../../config/servers.js';

// ANSI color codes
const RED = '\x1b[31m';
const ORANGE = '\x1b[38;5;208m';
const GRAY = '\x1b[90m';
const RESET = '\x1b[0m';
const PREFIX = '█';

// Spinner animation frames
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

class ThinkingIndicator {
  private interval: NodeJS.Timeout | null = null;
  private frameIndex = 0;

  start() {
    process.stdout.write(`${ORANGE}${PREFIX}${RESET} Assistant: `);
    this.interval = setInterval(() => {
      process.stdout.write(`\r${ORANGE}${PREFIX}${RESET} Assistant: ${GRAY}${SPINNER_FRAMES[this.frameIndex]}${RESET}`);
      this.frameIndex = (this.frameIndex + 1) % SPINNER_FRAMES.length;
    }, 80);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      // Clear the thinking line
      process.stdout.write(`\r${ORANGE}${PREFIX}${RESET} Assistant:    \r`);
      process.stdout.write(`${ORANGE}${PREFIX}${RESET} Assistant: `);
    }
  }
}

export class CLIInterface {
  private agent!: AgentCore;
  private rl!: readline.Interface;
  private toolCallHistory: ToolCallInfo[] = [];
  private expandedMode: boolean = false;

  constructor(
    private metaToolProxy: MetaToolProxy,
    private config: Config
  ) {
    this.agent = new AgentCore(metaToolProxy, config);
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  private formatUserMessage(text: string): string {
    return text.split('\n').map(line => `${RED}${PREFIX}${RESET} ${line}`).join('\n');
  }

  private formatAssistantMessage(text: string): string {
    return text.split('\n').map(line => `${ORANGE}${PREFIX}${RESET} ${line}`).join('\n');
  }

  private formatToolMessage(text: string): string {
    return text.split('\n').map(line => `${GRAY}${PREFIX}${RESET} ${line}`).join('\n');
  }

  private formatArgs(args: any): string {
    const str = JSON.stringify(args);
    const maxLength = 100;
    if (str.length > maxLength) {
      return str.substring(0, maxLength - 3) + '...';
    }
    return str;
  }

  private stripAnsiCodes(text: string): string {
    // Remove ANSI escape codes (color codes, positioning, etc.)
    return text.replace(/[\u0001-\u0009\u000b-\u001f\u007f-\u009f]/g, '');
  }

  private truncateToolOutput(text: string, maxLines: number = 5): { lines: string[], truncated: boolean } {
    const cleaned = this.stripAnsiCodes(text);
    const allLines = cleaned.split('\n');
    
    if (allLines.length <= maxLines) {
      return { lines: allLines, truncated: false };
    }
    
    // Show first 3 and last 2 lines with a truncation indicator
    const firstLines = allLines.slice(0, 3);
    const lastLines = allLines.slice(-2);
    const truncatedCount = allLines.length - 5;
    
    return {
      lines: [
        ...firstLines,
        `... [${truncatedCount} more lines] ...`,
        ...lastLines
      ],
      truncated: true
    };
  }

  async run() {
    console.log(`${GRAY}MCP Agent started. Type your requests (Ctrl+D to exit).${RESET}\n`);
    console.log(`${GRAY}Workspace: ${this.config.paths.workspace}`);
    console.log(`Skills: ${this.config.paths.skills}${RESET}\n`);

    // Set up clean exit on Ctrl+C
    const cleanup = () => {
      console.log(`\n${GRAY}Goodbye!${RESET}`);
      this.rl.close();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);

    while (true) {
      try {
        console.log(); // Blank line before prompt
        const userInput = await this.rl.question(`${RED}${PREFIX}${RESET} You: `);
        if (!userInput.trim()) continue;

        // Handle commands
        if (userInput.trim() === '/clear') {
          this.agent.resetConversation();
          this.toolCallHistory = [];
          console.log(`${GRAY}${PREFIX}${RESET} Conversation cleared\n`);
          continue;
        }

        if (userInput.trim() === '/open') {
          this.expandedMode = true;
          console.log(`${GRAY}${PREFIX}${RESET} Showing full tool outputs\n`);
          if (this.toolCallHistory.length > 0) {
            console.log(`${GRAY}${PREFIX}${RESET} Previous tool calls:\n`);
            this.toolCallHistory.forEach((info, index) => {
              console.log(this.formatToolMessage(`→ Tool ${index + 1}: ${info.name}(${this.formatArgs(info.args)})`));

              let outputText = '';
              if (info.result.structuredContent) {
                outputText = JSON.stringify(info.result.structuredContent, null, 2);
              } else if (info.result.content[0]?.type === 'text') {
                outputText = info.result.content[0].text;
              }

              if (outputText) {
                const lines = this.stripAnsiCodes(outputText).split('\n');
                lines.forEach(line => console.log(this.formatToolMessage(`  ${line}`)));
              }
              console.log(); // Blank line after tool result
            });
          } else {
            console.log(`${GRAY}${PREFIX}${RESET} No tool calls in history\n`);
          }
          continue;
        }

        if (userInput.trim() === '/close') {
          this.expandedMode = false;
          console.log(`${GRAY}${PREFIX}${RESET} Tool outputs will be truncated\n`);
          continue;
        }

        console.log(); // Blank line after user input
        
        const thinking = new ThinkingIndicator();
        thinking.start();
        
        const response = await this.agent.processMessage(
          userInput,
          (info: ToolCallInfo) => {
            // Stop thinking indicator for tool output
            thinking.stop();
            process.stdout.write('\n'); // Move to new line after stopping indicator
            
            // Store tool call in history
            this.toolCallHistory.push(info);

            console.log(this.formatToolMessage(`→ Tool: ${info.name}(${this.formatArgs(info.args)})`));

            let outputText = '';
            if (info.result.structuredContent) {
              outputText = JSON.stringify(info.result.structuredContent, null, 2);
            } else if (info.result.content[0]?.type === 'text') {
              outputText = info.result.content[0].text;
            }

            if (outputText) {
              if (this.expandedMode) {
                // Show full output in expanded mode
                const lines = this.stripAnsiCodes(outputText).split('\n');
                lines.forEach(line => console.log(this.formatToolMessage(`  ${line}`)));
              } else {
                // Show truncated output in normal mode
                const { lines, truncated } = this.truncateToolOutput(outputText);
                lines.forEach(line => console.log(this.formatToolMessage(`  ${line}`)));
                if (truncated) {
                  console.log(this.formatToolMessage(`  ${GRAY}[Output truncated - use /open to see full results]${RESET}`));
                }
              }
            }
            console.log(); // Blank line after tool results
            
            // Restart thinking indicator for next processing
            thinking.start();
          }
        );

        thinking.stop();
        // Format response - all lines need the orange prefix
        const lines = response.split('\n');
        lines.forEach((line, i) => {
          if (i === 0) {
            console.log(line); // First line is already formatted by stop()
          } else {
            console.log(`${ORANGE}${PREFIX}${RESET} ${line}`);
          }
        });
      } catch (error: any) {
        if (error.code === 'ERR_USE_AFTER_CLOSE' || error.code === 'ABORT_ERR') {
          cleanup();
        }
        // Suppress other readline errors during cleanup
        if (!error.code?.includes('ABORT') && error.code !== 'ERR_USE_AFTER_CLOSE') {
          console.error(`${GRAY}${PREFIX}${RESET} Error:`, error);
        }
      }
    }
  }

  async close() {
    this.rl.close();
  }
}
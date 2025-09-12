import { callMCPTool } from "../../client.js";

/**
 * [container] Execute TypeScript code in an isolated Docker container with access to generated tool bindings
 * @param input - {"type":"object","properties":{"code":{"type":"string","description":"TypeScript code to execute. Can import generated tool bindings from ../generated"},"timeout":{"type":"number","description":"Execution timeout in milliseconds","default":30000}},"required":["code"]}
 * @returns {"type":"object","properties":{"stdout":{"type":"string"},"stderr":{"type":"string"},"exitCode":{"type":"number"}}}
 */
export async function execute(input: { code: string; timeout?: number }): Promise<{ stdout?: string; stderr?: string; exitCode?: number }> {
    const result = await callMCPTool('container__execute', input);
      
      if (result.isError) {
        throw new Error(`Tool container__execute failed: ${result.content[0]?.text || 'Unknown error'}`);
      }
      
      if (result.structuredContent) {
        return result.structuredContent as { stdout?: string; stderr?: string; exitCode?: number };
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

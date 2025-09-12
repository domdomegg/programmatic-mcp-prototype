import { callMCPTool } from "../../client.js";

/**
 * [bash] 
 *                         Force terminate a running terminal session.
 *                         
 *                         This command can be referenced as "DC: ..." or "use Desktop Commander to ..." in your instructions.
 * @param input - {"type":"object","properties":{"pid":{"type":"number"}},"required":["pid"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}
 * @returns unknown
 */
export async function force_terminate(input: { pid: number }): Promise<unknown> {
    const result = await callMCPTool('bash__force_terminate', input);
      
      if (result.isError) {
        throw new Error(`Tool bash__force_terminate failed: ${result.content[0]?.text || 'Unknown error'}`);
      }
      
      if (result.structuredContent) {
        return result.structuredContent as unknown;
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

import { callMCPTool } from "../../client.js";

/**
 * [bash] 
 *                         Get usage statistics for debugging and analysis.
 *                         
 *                         Returns summary of tool usage, success/failure rates, and performance metrics.
 *                         
 *                         This command can be referenced as "DC: ..." or "use Desktop Commander to ..." in your instructions.
 * @param input - {"type":"object","properties":{},"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}
 * @returns unknown
 */
export async function get_usage_stats(input: {  }): Promise<unknown> {
    const result = await callMCPTool('bash__get_usage_stats', input);
      
      if (result.isError) {
        throw new Error(`Tool bash__get_usage_stats failed: ${result.content[0]?.text || 'Unknown error'}`);
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

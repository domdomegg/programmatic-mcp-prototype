import { callMCPTool } from "../../client.js";

/**
 * [bash] 
 *                         Stop an active search.
 *                         
 *                         Stops the background search process gracefully. Use this when you've found
 *                         what you need or if a search is taking too long. Similar to force_terminate
 *                         for terminal processes.
 *                         
 *                         The search will still be available for reading final results until it's
 *                         automatically cleaned up after 5 minutes.
 *                         
 *                         This command can be referenced as "DC: ..." or "use Desktop Commander to ..." in your instructions.
 * @param input - {"type":"object","properties":{"sessionId":{"type":"string"}},"required":["sessionId"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}
 * @returns unknown
 */
export async function stop_search(input: { sessionId: string }): Promise<unknown> {
    const result = await callMCPTool('bash__stop_search', input);
      
      if (result.isError) {
        throw new Error(`Tool bash__stop_search failed: ${result.content[0]?.text || 'Unknown error'}`);
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

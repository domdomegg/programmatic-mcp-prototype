import { callMCPTool } from "../../client.js";

/**
 * [bash] 
 *                         Get more results from an active search with offset-based pagination.
 *                         
 *                         Supports partial result reading with:
 *                         - 'offset' (start result index, default: 0)
 *                           * Positive: Start from result N (0-based indexing)
 *                           * Negative: Read last N results from end (tail behavior)
 *                         - 'length' (max results to read, default: 100)
 *                           * Used with positive offsets for range reading
 *                           * Ignored when offset is negative (reads all requested tail results)
 *                         
 *                         Examples:
 *                         - offset: 0, length: 100     → First 100 results
 *                         - offset: 200, length: 50    → Results 200-249
 *                         - offset: -20                → Last 20 results
 *                         - offset: -5, length: 10     → Last 5 results (length ignored)
 *                         
 *                         Returns only results in the specified range, along with search status.
 *                         Works like read_process_output - call this repeatedly to get progressive
 *                         results from a search started with start_search.
 *                         
 *                         This command can be referenced as "DC: ..." or "use Desktop Commander to ..." in your instructions.
 * @param input - {"type":"object","properties":{"sessionId":{"type":"string"},"offset":{"type":"number","default":0},"length":{"type":"number","default":100}},"required":["sessionId"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}
 * @returns unknown
 */
export async function get_more_search_results(input: { sessionId: string; offset?: number; length?: number }): Promise<unknown> {
    const result = await callMCPTool('bash__get_more_search_results', input);
      
      if (result.isError) {
        throw new Error(`Tool bash__get_more_search_results failed: ${result.content[0]?.text || 'Unknown error'}`);
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

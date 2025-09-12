import { callMCPTool } from "../../client.js";

/**
 * [bash] 
 *                         List all active terminal sessions.
 *                         
 *                         Shows session status including:
 *                         - PID: Process identifier  
 *                         - Blocked: Whether session is waiting for input
 *                         - Runtime: How long the session has been running
 *                         
 *                         DEBUGGING REPLs:
 *                         - "Blocked: true" often means REPL is waiting for input
 *                         - Use this to verify sessions are running before sending input
 *                         - Long runtime with blocked status may indicate stuck process
 *                         
 *                         This command can be referenced as "DC: ..." or "use Desktop Commander to ..." in your instructions.
 * @param input - {"type":"object","properties":{},"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}
 * @returns unknown
 */
export async function list_sessions(input: {  }): Promise<unknown> {
    const result = await callMCPTool('bash__list_sessions', input);
      
      if (result.isError) {
        throw new Error(`Tool bash__list_sessions failed: ${result.content[0]?.text || 'Unknown error'}`);
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

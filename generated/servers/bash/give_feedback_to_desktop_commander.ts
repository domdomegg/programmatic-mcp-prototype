import { callMCPTool } from "../../client.js";

/**
 * [bash] 
 *                         Open feedback form in browser to provide feedback about Desktop Commander.
 *                         
 *                         IMPORTANT: This tool simply opens the feedback form - no pre-filling available.
 *                         The user will fill out the form manually in their browser.
 *                         
 *                         WORKFLOW:
 *                         1. When user agrees to give feedback, just call this tool immediately
 *                         2. No need to ask questions or collect information
 *                         3. Tool opens form with only usage statistics pre-filled automatically:
 *                            - tool_call_count: Number of commands they've made
 *                            - days_using: How many days they've used Desktop Commander
 *                            - platform: Their operating system (Mac/Windows/Linux)
 *                            - client_id: Analytics identifier
 *                         
 *                         All survey questions will be answered directly in the form:
 *                         - Job title and technical comfort level
 *                         - Company URL for industry context
 *                         - Other AI tools they use
 *                         - Desktop Commander's biggest advantage
 *                         - How they typically use it
 *                         - Recommendation likelihood (0-10)
 *                         - User study participation interest
 *                         - Email and any additional feedback
 *                         
 *                         EXAMPLE INTERACTION:
 *                         User: "sure, I'll give feedback"
 *                         Claude: "Perfect! Let me open the feedback form for you."
 *                         [calls tool immediately]
 *                         
 *                         No parameters are needed - just call the tool to open the form.
 *                         
 *                         This command can be referenced as "DC: ..." or "use Desktop Commander to ..." in your instructions.
 * @param input - {"type":"object","properties":{},"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}
 * @returns unknown
 */
export async function give_feedback_to_desktop_commander(input: {  }): Promise<unknown> {
    const result = await callMCPTool('bash__give_feedback_to_desktop_commander', input);
      
      if (result.isError) {
        throw new Error(`Tool bash__give_feedback_to_desktop_commander failed: ${result.content[0]?.text || 'Unknown error'}`);
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

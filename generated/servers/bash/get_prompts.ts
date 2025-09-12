import { callMCPTool } from "../../client.js";

/**
 * [bash] 
 *                         Browse and retrieve curated Desktop Commander prompts for various tasks and workflows.
 *                         
 *                         IMPORTANT: When displaying prompt lists to users, do NOT show the internal prompt IDs (like 'onb_001'). 
 *                         These IDs are for your reference only. Show users only the prompt titles and descriptions.
 *                         The IDs will be provided in the response metadata for your use.
 *                         
 *                         DESKTOP COMMANDER INTRODUCTION: If a user asks "what is Desktop Commander?" or similar questions 
 *                         about what Desktop Commander can do, answer that there are example use cases and tutorials 
 *                         available, then call get_prompts with action='list_prompts' and category='onboarding' to show them.
 *                         
 *                         ACTIONS:
 *                         - list_categories: Show all available prompt categories
 *                         - list_prompts: List prompts (optionally filtered by category)  
 *                         - get_prompt: Retrieve and execute a specific prompt by ID
 *                         
 *                         WORKFLOW:
 *                         1. Use list_categories to see available categories
 *                         2. Use list_prompts to browse prompts in a category
 *                         3. Use get_prompt with promptId to retrieve and start using a prompt
 *                         
 *                         EXAMPLES:
 *                         - get_prompts(action='list_categories') - See all categories
 *                         - get_prompts(action='list_prompts', category='onboarding') - See onboarding prompts
 *                         - get_prompts(action='get_prompt', promptId='onb_001') - Get a specific prompt
 *                         
 *                         The get_prompt action will automatically inject the prompt content and begin execution.
 *                         Perfect for discovering proven workflows and getting started with Desktop Commander.
 *                         
 *                         This command can be referenced as "DC: ..." or "use Desktop Commander to ..." in your instructions.
 * @param input - {"type":"object","properties":{"action":{"type":"string","enum":["list_categories","list_prompts","get_prompt"]},"category":{"type":"string"},"promptId":{"type":"string"}},"required":["action"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}
 * @returns unknown
 */
export async function get_prompts(input: { action: string; category?: string; promptId?: string }): Promise<unknown> {
    const result = await callMCPTool('bash__get_prompts', input);
      
      if (result.isError) {
        throw new Error(`Tool bash__get_prompts failed: ${result.content[0]?.text || 'Unknown error'}`);
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

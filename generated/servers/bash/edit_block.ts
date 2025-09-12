import { callMCPTool } from "../../client.js";

/**
 * [bash] 
 *                         Apply surgical text replacements to files.
 *                         
 *                         BEST PRACTICE: Make multiple small, focused edits rather than one large edit.
 *                         Each edit_block call should change only what needs to be changed - include just enough 
 *                         context to uniquely identify the text being modified.
 *                         
 *                         Takes:
 *                         - file_path: Path to the file to edit
 *                         - old_string: Text to replace
 *                         - new_string: Replacement text
 *                         - expected_replacements: Optional parameter for number of replacements
 *                         
 *                         By default, replaces only ONE occurrence of the search text.
 *                         To replace multiple occurrences, provide the expected_replacements parameter with
 *                         the exact number of matches expected.
 *                         
 *                         UNIQUENESS REQUIREMENT: When expected_replacements=1 (default), include the minimal
 *                         amount of context necessary (typically 1-3 lines) before and after the change point,
 *                         with exact whitespace and indentation.
 *                         
 *                         When editing multiple sections, make separate edit_block calls for each distinct change
 *                         rather than one large replacement.
 *                         
 *                         When a close but non-exact match is found, a character-level diff is shown in the format:
 *                         common_prefix{-removed-}{+added+}common_suffix to help you identify what's different.
 *                         
 *                         Similar to write_file, there is a configurable line limit (fileWriteLineLimit) that warns
 *                         if the edited file exceeds this limit. If this happens, consider breaking your edits into
 *                         smaller, more focused changes.
 *                         
 *                         IMPORTANT: Always use absolute paths for reliability. Paths are automatically normalized regardless of slash direction. Relative paths may fail as they depend on the current working directory. Tilde paths (~/...) might not work in all contexts. Unless the user explicitly asks for relative paths, use absolute paths.
 *                         This command can be referenced as "DC: ..." or "use Desktop Commander to ..." in your instructions.
 * @param input - {"type":"object","properties":{"file_path":{"type":"string"},"old_string":{"type":"string"},"new_string":{"type":"string"},"expected_replacements":{"type":"number","default":1}},"required":["file_path","old_string","new_string"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}
 * @returns unknown
 */
export async function edit_block(input: { file_path: string; old_string: string; new_string: string; expected_replacements?: number }): Promise<unknown> {
    const result = await callMCPTool('bash__edit_block', input);
      
      if (result.isError) {
        throw new Error(`Tool bash__edit_block failed: ${result.content[0]?.text || 'Unknown error'}`);
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

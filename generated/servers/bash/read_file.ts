import { callMCPTool } from "../../client.js";

/**
 * [bash] 
 *                         Read the contents of a file from the file system or a URL with optional offset and length parameters.
 *                         
 *                         Prefer this over 'execute_command' with cat/type for viewing files.
 *                         
 *                         Supports partial file reading with:
 *                         - 'offset' (start line, default: 0)
 *                           * Positive: Start from line N (0-based indexing)
 *                           * Negative: Read last N lines from end (tail behavior)
 *                         - 'length' (max lines to read, default: configurable via 'fileReadLineLimit' setting, initially 1000)
 *                           * Used with positive offsets for range reading
 *                           * Ignored when offset is negative (reads all requested tail lines)
 *                         
 *                         Examples:
 *                         - offset: 0, length: 10     → First 10 lines
 *                         - offset: 100, length: 5    → Lines 100-104
 *                         - offset: -20               → Last 20 lines  
 *                         - offset: -5, length: 10    → Last 5 lines (length ignored)
 *                         
 *                         Performance optimizations:
 *                         - Large files with negative offsets use reverse reading for efficiency
 *                         - Large files with deep positive offsets use byte estimation
 *                         - Small files use fast readline streaming
 *                         
 *                         When reading from the file system, only works within allowed directories.
 *                         Can fetch content from URLs when isUrl parameter is set to true
 *                         (URLs are always read in full regardless of offset/length).
 *                         
 *                         Handles text files normally and image files are returned as viewable images.
 *                         Recognized image types: PNG, JPEG, GIF, WebP.
 *                         
 *                         IMPORTANT: Always use absolute paths for reliability. Paths are automatically normalized regardless of slash direction. Relative paths may fail as they depend on the current working directory. Tilde paths (~/...) might not work in all contexts. Unless the user explicitly asks for relative paths, use absolute paths.
 *                         This command can be referenced as "DC: ..." or "use Desktop Commander to ..." in your instructions.
 * @param input - {"type":"object","properties":{"path":{"type":"string"},"isUrl":{"type":"boolean","default":false},"offset":{"type":"number","default":0},"length":{"type":"number","default":1000}},"required":["path"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}
 * @returns unknown
 */
export async function read_file(input: { path: string; isUrl?: boolean; offset?: number; length?: number }): Promise<unknown> {
    const result = await callMCPTool('bash__read_file', input);
      
      if (result.isError) {
        throw new Error(`Tool bash__read_file failed: ${result.content[0]?.text || 'Unknown error'}`);
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

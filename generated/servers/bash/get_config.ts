import { callMCPTool } from "../../client.js";

/**
 * [bash] 
 *                         Get the complete server configuration as JSON. Config includes fields for:
 *                         - blockedCommands (array of blocked shell commands)
 *                         - defaultShell (shell to use for commands)
 *                         - allowedDirectories (paths the server can access)
 *                         - fileReadLineLimit (max lines for read_file, default 1000)
 *                         - fileWriteLineLimit (max lines per write_file call, default 50)
 *                         - telemetryEnabled (boolean for telemetry opt-in/out)
 *                         - currentClient (information about the currently connected MCP client)
 *                         - clientHistory (history of all clients that have connected)
 *                         - version (version of the DesktopCommander)
 *                         - systemInfo (operating system and environment details)
 *                         This command can be referenced as "DC: ..." or "use Desktop Commander to ..." in your instructions.
 * @param input - {"type":"object","properties":{},"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}
 * @returns unknown
 */
export async function get_config(input: {  }): Promise<unknown> {
    const result = await callMCPTool('bash__get_config', input);
      
      if (result.isError) {
        throw new Error(`Tool bash__get_config failed: ${result.content[0]?.text || 'Unknown error'}`);
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

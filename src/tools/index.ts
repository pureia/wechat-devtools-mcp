import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPageTools } from './pages.js';
import { registerElementTools } from './elements.js';
import { registerMiniProgramTools } from './mini-program.js';
import { registerHandleTools, registerLifecycleTools } from './lifecycle.js';

/**
 * 注册全部 MCP 工具（按能力域拆分，聚合在此装配）。
 */
export function registerTools(server: McpServer): void {
  registerLifecycleTools(server);
  registerMiniProgramTools(server);
  registerPageTools(server);
  registerElementTools(server);
  registerHandleTools(server);
}

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from '../tools/index.js';

export const SERVER_NAME = 'wechat-devtools-mcp';
export const SERVER_VERSION = '0.1.0';

/**
 * 创建并装配 MCP 服务器：注册工具后返回。
 */
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });
  registerTools(server);
  return server;
}

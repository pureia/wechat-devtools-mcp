import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from '../tools/index.js';
import { PKG_NAME, SERVER_VERSION } from '../wechat/version.js';

/**
 * 创建并装配 MCP 服务器：注册工具后返回。
 */
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: PKG_NAME,
    version: SERVER_VERSION,
  });
  registerTools(server);
  return server;
}

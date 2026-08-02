#!/usr/bin/env node
/**
 * miniprogram-automator MCP 服务器
 *
 * 将微信小程序自动化 SDK (miniprogram-automator) 的 API 封装为 MCP 工具，
 * 供 AI 助手通过 stdio 调用，控制微信开发者工具里运行的小程序。
 *
 * 使用前提:
 * 1. 微信开发者工具开启「设置 -> 安全设置 -> 服务端口」(CLI/HTTP 调用)
 * 2. 小程序已编译（uni-app 项目请先执行 uni build，指向 dist/build/mp-weixin）
 *
 * 状态模型:
 * - 整个进程同一时刻维护一个 MiniProgram 连接
 * - page 与 element 均为"句柄"：调用返回 page_id / element_id，后续操作凭 id 找到实例
 */
import process from 'node:process';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './mcp/server.js';
import { getMiniProgram } from './wechat/session.js';
import { applyMiniProgramPatch } from './wechat/automator.js';
import { PKG_NAME, SERVER_VERSION } from './wechat/version.js';

// 兼容新版微信开发者工具（>= 2.0）：Tool.getInfo 不再返回 SDKVersion 字段，
// 老 SDK (0.12.1) 的 checkVersion 会因读取 undefined 崩溃（TypeError: split），
// 必须在任何连接建立前完成补丁。
applyMiniProgramPatch();

async function main(): Promise<void> {
  console.error(`[${PKG_NAME}] v${SERVER_VERSION} 已启动（微信小程序自动化 MCP）`);
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // 进程退出前释放小程序连接与自动化端口占用（开发者工具窗口保持打开）
  const cleanup = (): void => {
    const mp = getMiniProgram();
    if (mp) {
      try {
        mp.disconnect();
      }
      catch {
        /* 连接已失效则忽略 */
      }
    }
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.stdin.on('close', cleanup);
}

main().catch((err) => {
  console.error(`[${PKG_NAME}] 启动失败:`, err);
  process.exit(1);
});

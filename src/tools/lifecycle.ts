import type { MiniProgram } from 'miniprogram-automator';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { cliOptions } from '../config.js';
import { McpError } from '../wechat/errors.js';
import { automator } from '../wechat/automator.js';
import { SERVER_VERSION } from '../wechat/version.js';
import { safeCurrentPage, wrap } from '../wechat/utils.js';
import { discoverProjectPath, launchMiniProgram } from '../wechat/launcher.js';
import {
  clearHandles,
  getMiniProgram,
  hasMiniProgram,
  isConnecting,
  registerEventHandlers,
  registerPage,
  requireMiniProgram,
  resetSession,
  setConnecting,
  setMiniProgram,
} from '../wechat/session.js';

interface LaunchArgs {
  projectPath?: string;
  cliPath?: string;
  timeout?: number;
  port?: number;
  account?: string;
  ticket?: string;
  trustProject?: boolean;
}

export function registerLifecycleTools(server: McpServer): void {
  // ---------------- 连接与生命周期 ----------------
  server.registerTool(
    'launch',
    {
      description: '启动微信开发者工具并连接小程序（支持项目路径、cli 路径、端口、票据等参数）',
      inputSchema: {
        projectPath: z
          .string()
          .optional()
          .describe('小程序项目绝对路径（uni-app 项目需指向编译产物 unpackage/dist/build/mp-weixin），缺省时自动探测当前工作区'),
        cliPath: z
          .string()
          .optional()
          .describe('微信开发者工具 cli 绝对路径，缺省时自动探测默认安装位置，Windows 默认: C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat'),
        timeout: z.number().int().positive().optional().describe('启动最长等待时间(ms)，默认 30000'),
        port: z.number().int().positive().optional().describe('自动化 WebSocket 端口号'),
        account: z.string().optional().describe('用户 openid，用于多账号调试'),
        ticket: z.string().optional().describe('开发者工具登录票据'),
        trustProject: z
          .boolean()
          .optional()
          .describe('自动信任项目（避免首次打开弹信任对话框阻塞编译），建议设为 true'),
      },
    },
    wrap(async (args: LaunchArgs) => {
      if (hasMiniProgram() || isConnecting()) {
        throw new Error('已存在连接，请先调用 close 或 disconnect 后再 launch');
      }
      // 参数优先级：工具参数 > 命令行参数 > 自动探测
      let { projectPath } = args;
      if (!projectPath) {
        const discovered = cliOptions.projectPath || (await discoverProjectPath());
        if (!discovered) {
          throw new McpError(
            'INVALID_PROJECT',
            '未提供 projectPath 且自动探测失败',
            '请传入 projectPath 指向编译产物（uni-app: unpackage/dist/build/mp-weixin；原生小程序: 含 project.config.json 的目录）'
          );
        }
        projectPath = discovered;
      }
      setConnecting(true);
      let mp: MiniProgram | null = null;
      try {
        const launchArgs = {
          ...cliOptions,
          projectPath,
          ...(args.cliPath !== undefined && { cliPath: args.cliPath }),
          ...(args.timeout !== undefined && { timeout: args.timeout }),
          ...(args.port !== undefined && { port: args.port }),
          ...(args.account !== undefined && { account: args.account }),
          ...(args.ticket !== undefined && { ticket: args.ticket }),
          ...(args.trustProject !== undefined && { trustProject: args.trustProject }),
        };
        mp = await launchMiniProgram(launchArgs);
        registerEventHandlers(mp);
        const page = await safeCurrentPage(mp);
        // 确认连接可用后才置为全局连接，避免 safeCurrentPage 失败时残留脏状态
        setMiniProgram(mp);
        return { ok: true, message: '启动并连接成功', current_page: registerPage(page) };
      }
      catch (err) {
        if (mp) {
          try {
            mp.disconnect();
          }
          catch {
            /* 连接已失效则忽略 */
          }
        }
        throw err;
      }
      finally {
        setConnecting(false);
      }
    })
  );

  server.registerTool(
    'connect',
    {
      description: '连接到已在微信开发者工具中运行的小程序（缺省连接本机 --port 端口）',
      inputSchema: {
        wsEndpoint: z
          .string()
          .optional()
          .describe('开发者工具自动化 WebSocket 地址（如 ws://127.0.0.1:9420），缺省时使用 --port 指定的端口'),
      },
    },
    wrap(async ({ wsEndpoint }: { wsEndpoint?: string }) => {
      if (hasMiniProgram() || isConnecting()) {
        throw new Error('已存在连接，请先调用 close 或 disconnect 后再 connect');
      }
      setConnecting(true);
      let mp: MiniProgram | null = null;
      try {
        const endpoint = wsEndpoint ?? `ws://127.0.0.1:${cliOptions.port ?? 9420}`;
        mp = await automator.connect({ wsEndpoint: endpoint });
        registerEventHandlers(mp);
        const page = await safeCurrentPage(mp);
        // 确认连接可用后才置为全局连接，避免 safeCurrentPage 失败时残留脏状态
        setMiniProgram(mp);
        return { ok: true, message: '连接成功', current_page: registerPage(page) };
      }
      catch (err) {
        if (mp) {
          try {
            mp.disconnect();
          }
          catch {
            /* 连接已失效则忽略 */
          }
        }
        throw err;
      }
      finally {
        setConnecting(false);
      }
    })
  );

  server.registerTool(
    'status',
    { description: '查询当前连接状态与页面栈信息' },
    wrap(async () => {
      const mp = getMiniProgram();
      if (!mp) {
        return { connected: false, mcp_version: SERVER_VERSION, message: '尚未连接，请调用 launch 或 connect' };
      }
      try {
        const stack = await mp.pageStack();
        return {
          connected: true,
          mcp_version: SERVER_VERSION,
          page_count: stack.length,
          pages: stack.map((p) => ({ path: p.path, query: p.query ?? {} })),
        };
      }
      catch (err) {
        // 连接可能已失效（开发者工具被关闭/崩溃）：报告状态而不是抛错
        const message = err instanceof Error ? err.message : String(err);
        return {
          connected: false,
          mcp_version: SERVER_VERSION,
          message: '连接已失效',
          reason: message,
          hint: '请调用 close / disconnect 后重新 launch / connect，或重启 MCP 服务器',
        };
      }
    })
  );

  server.registerTool(
    'disconnect',
    { description: '断开小程序连接（开发者工具窗口保持打开）' },
    wrap(async () => {
      const mp = requireMiniProgram();
      try {
        mp.disconnect();
      }
      finally {
        resetSession();
      }
      return { ok: true, message: '已断开连接' };
    })
  );

  server.registerTool(
    'close',
    { description: '断开连接并关闭开发者工具中的项目窗口' },
    wrap(async () => {
      const mp = requireMiniProgram();
      try {
        await mp.close();
      }
      finally {
        resetSession();
      }
      return { ok: true, message: '已断开连接并关闭项目窗口' };
    })
  );
}

export function registerHandleTools(server: McpServer): void {
  // ---------------- 句柄清理 ----------------
  server.registerTool(
    'release_handles',
    {
      description: '清理缓存的 page / element 句柄，防止句柄无限增长',
      inputSchema: {
        scope: z
          .enum(['elements', 'pages', 'all'])
          .optional()
          .describe('清理句柄范围：elements 仅清元素、pages 仅清页面、all 全部清空，默认 all'),
      },
    },
    wrap(async ({ scope }: { scope?: 'elements' | 'pages' | 'all' }) => {
      clearHandles(scope ?? 'all');
      return { ok: true, message: '句柄已清理' };
    })
  );
}

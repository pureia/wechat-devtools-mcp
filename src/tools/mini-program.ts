import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrap } from '../wechat/utils.js';
import {
  clearEventLogs,
  getConsoleLogs,
  getExceptions,
  registerPage,
  requireMiniProgram,
} from '../wechat/session.js';

export function registerMiniProgramTools(server: McpServer): void {
  // ---------------- 小程序级操作 ----------------
  server.tool(
    'page_stack',
    '获取当前页面栈（所有已打开页面，并注册 page_id 句柄）',
    {},
    wrap(async () => {
      const mp = requireMiniProgram();
      const stack = await mp.pageStack();
      return { pages: stack.map((p) => registerPage(p)) };
    })
  );

  server.tool(
    'navigate_to',
    '跳转到应用内非 tabBar 页面',
    { url: z.string().describe('需要跳转的应用内非 tabBar 页面路径，如 /pages/xxx/index') },
    wrap(async ({ url }: { url: string }) => {
      const mp = requireMiniProgram();
      const page = await mp.navigateTo(url);
      return registerPage(page);
    })
  );

  server.tool(
    'redirect_to',
    '重定向到应用内非 tabBar 页面（关闭当前页面，替换栈顶）',
    { url: z.string().describe('需要跳转的应用内非 tabBar 页面路径') },
    wrap(async ({ url }: { url: string }) => {
      const mp = requireMiniProgram();
      const page = await mp.redirectTo(url);
      return registerPage(page);
    })
  );

  server.tool(
    'navigate_back',
    '返回上一页面',
    {},
    wrap(async () => {
      const mp = requireMiniProgram();
      const page = await mp.navigateBack();
      return registerPage(page);
    })
  );

  server.tool(
    're_launch',
    '关闭所有页面并重新打开指定页面',
    { url: z.string().describe('需要打开的应用内页面路径') },
    wrap(async ({ url }: { url: string }) => {
      const mp = requireMiniProgram();
      const page = await mp.reLaunch(url);
      return registerPage(page);
    })
  );

  server.tool(
    'switch_tab',
    '切换到 tabBar 页面（url 需以 / 开头）',
    { url: z.string().describe('需要跳转的 tabBar 页面路径') },
    wrap(async ({ url }: { url: string }) => {
      const mp = requireMiniProgram();
      const page = await mp.switchTab(url);
      return registerPage(page);
    })
  );

  server.tool(
    'current_page',
    '获取当前活动页面（返回 page_id 句柄）',
    {},
    wrap(async () => {
      const mp = requireMiniProgram();
      const page = await mp.currentPage();
      return registerPage(page);
    })
  );

  server.tool(
    'system_info',
    '获取小程序运行环境系统信息（机型、系统版本、微信版本等）',
    {},
    wrap(async () => {
      const mp = requireMiniProgram();
      return { system_info: await mp.systemInfo() };
    })
  );

  server.tool(
    'call_wx_method',
    '在 AppService 中调用 wx 全局方法并返回结果',
    {
      method: z.string().describe('需要调用的 wx 方法名，如 getStorageSync / setStorage'),
      args: z.array(z.any()).optional().describe('方法参数（异步方法无需传 success/fail 回调）'),
    },
    wrap(async ({ method, args }: { method: string; args?: unknown[] }) => {
      const mp = requireMiniProgram();
      return { result: await mp.callWxMethod(method, ...(args ?? [])) };
    })
  );

  server.tool(
    'mock_wx_method',
    '覆盖 wx 方法并返回固定结果（用于模拟第三方依赖）',
    {
      method: z.string().describe('需要覆盖的 wx 方法名'),
      result: z.any().describe('指定调用结果'),
    },
    wrap(async ({ method, result }: { method: string; result: unknown }) => {
      const mp = requireMiniProgram();
      await mp.mockWxMethod(method, result);
      return { ok: true, message: `wx.${method} 已被 mock 为固定返回值` };
    })
  );

  server.tool(
    'restore_wx_method',
    '恢复被 mock 的 wx 方法为原始实现',
    { method: z.string().describe('需要重置的 wx 方法名') },
    wrap(async ({ method }: { method: string }) => {
      const mp = requireMiniProgram();
      await mp.restoreWxMethod(method);
      return { ok: true, message: `wx.${method} 已恢复原始实现` };
    })
  );

  server.tool(
    'evaluate',
    '注入函数源码在 AppService 中执行并返回结果（可访问 getApp/getCurrentPages 等全局）',
    {
      code: z
        .string()
        .describe('注入 AppService 执行的函数源码字符串，如 function() { return getApp().globalData.userInfo }'),
      args: z.array(z.any()).optional().describe('执行时传入函数的参数'),
    },
    wrap(async ({ code, args }: { code: string; args?: unknown[] }) => {
      const mp = requireMiniProgram();
      return { result: await mp.evaluate(code, ...(args ?? [])) };
    })
  );

  server.tool(
    'page_scroll_to',
    '将当前页面滚动到指定位置',
    { scrollTop: z.number().describe('滚动到页面的目标位置，单位 px') },
    wrap(async ({ scrollTop }: { scrollTop: number }) => {
      const mp = requireMiniProgram();
      await mp.pageScrollTo(scrollTop);
      return { ok: true };
    })
  );

  server.tool(
    'screenshot',
    '对小程序当前页面截图（传 path 保存到文件，否则返回图片 base64）',
    { path: z.string().optional().describe('图片保存路径，不传则返回图片 base64 编码') },
    wrap(async ({ path }: { path?: string }) => {
      const mp = requireMiniProgram();
      if (path) {
        await mp.screenshot({ path });
        return { ok: true, path };
      }
      return { image_base64: await mp.screenshot() };
    })
  );

  server.tool(
    'get_ticket',
    '获取开发者工具登录票据（有效期两小时）',
    {},
    wrap(async () => {
      const mp = requireMiniProgram();
      return { result: await mp.getTicket() };
    })
  );

  server.tool(
    'set_ticket',
    '设置开发者工具登录票据',
    { ticket: z.string().describe('登录票据') },
    wrap(async ({ ticket }: { ticket: string }) => {
      const mp = requireMiniProgram();
      await mp.setTicket(ticket);
      return { ok: true };
    })
  );

  server.tool(
    'refresh_ticket',
    '刷新登录票据（过期时间重置为两小时）',
    {},
    wrap(async () => {
      const mp = requireMiniProgram();
      await mp.refreshTicket();
      return { ok: true, message: '票据已刷新，过期时间重置为两小时' };
    })
  );

  // ---------------- 运行日志 ----------------
  server.tool(
    'console_messages',
    '获取小程序运行产生的控制台日志（连接后自动收集，最多 500 条）',
    {},
    wrap(async () => {
      return { messages: getConsoleLogs() };
    })
  );

  server.tool(
    'exception_messages',
    '获取小程序运行产生的异常日志（连接后自动收集，最多 500 条）',
    {},
    wrap(async () => {
      return { exceptions: getExceptions() };
    })
  );

  server.tool(
    'clear_event_logs',
    '清空已收集的控制台日志与异常记录',
    {},
    wrap(async () => {
      clearEventLogs();
      return { ok: true };
    })
  );
}

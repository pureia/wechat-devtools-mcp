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

// ---------------- 网络请求监控（逻辑层 hook wx.request） ----------------
// 注入 AppService 执行的函数必须自包含（evaluate 序列化执行，不能引用外部闭包），
// 且返回对象需 JSON 可序列化。hook 只透传不改参数，对业务无影响；日志存逻辑层全局，跨页面存活。

/** 安装 wx.request 透传拦截器（幂等，hook 被 mock/restore 顶掉时自动重装）：记录 url/method/header/data/statusCode/响应/耗时，上限 500 条；data/response 写入时截断到 2000 字符 */
const NETWORK_HOOK_FN = `function () {
  var g = globalThis;
  if (g.__mcpNetHookInstalled) {
    if (g.__mcpNetHook && g.wx && g.wx.request === g.__mcpNetHook) return { installed: true, already: true };
    g.__mcpNetHookInstalled = false; // hook 已被 mock/restore 或业务替换顶掉，允许重装
  }
  if (!g.wx || typeof g.wx.request !== 'function') return { installed: false, reason: 'wx.request 不可用' };
  var log = g.__mcpNetLog || (g.__mcpNetLog = []);
  var MAX = 500;
  var orig = g.wx.request;
  g.__mcpNetHook = orig;
  var trunc = function (v) {
    var s;
    try { s = typeof v === 'string' ? v : JSON.stringify(v); } catch (e) { return String(v); }
    if (s && s.length > 2000) return s.slice(0, 2000) + '…[截断]';
    return v;
  };
  g.wx.request = function (options) {
    if (!options || typeof options !== 'object') return orig(options);
    // 浅拷贝后替换回调，避免污染调用方 options 对象（复用同一 options 的多次请求均可记录）
    var opts = {};
    for (var k in options) opts[k] = options[k];
    var rec = { url: opts.url, method: opts.method || 'GET', header: opts.header, data: trunc(opts.data), ts: Date.now() };
    var done = false;
    var commit = function (extra) {
      if (done) return;
      done = true;
      rec.duration = Date.now() - rec.ts;
      for (var ek in extra) rec[ek] = extra[ek];
      log.push(rec);
      if (log.length > MAX) log.shift();
    };
    opts.success = function (res) {
      try { commit({ ok: true, statusCode: res.statusCode, response: trunc(res.data) }); } catch (e) { }
      if (options.success) options.success(res);
    };
    opts.fail = function (err) {
      try { commit({ ok: false, errMsg: err.errMsg }); } catch (e) { }
      if (options.fail) options.fail(err);
    };
    opts.complete = function (res) {
      try { commit({ ok: true }); } catch (e) { }
      if (options.complete) options.complete(res);
    };
    return orig(opts);
  };
  g.__mcpNetHookInstalled = true;
  return { installed: true };
}`;

/** 读取日志：按 url 子串过滤 + 条数限制，倒序返回最新条目；response/data/header 等大字段截断到 2000 字符 */
const NETWORK_READ_FN = `function (filter, limit) {
  var log = globalThis.__mcpNetLog || [];
  var out = [];
  var cap = limit || 50;
  function trunc(v) {
    var s;
    try { s = typeof v === 'string' ? v : JSON.stringify(v); } catch (e) { return String(v); }
    if (s && s.length > 2000) return s.slice(0, 2000) + '…[截断]';
    return v;
  }
  for (var i = log.length - 1; i >= 0; i--) {
    var r = log[i];
    if (filter && r.url && r.url.indexOf(filter) < 0) continue;
    var item = { url: r.url, method: r.method, ts: r.ts, duration: r.duration };
    if (r.ok !== undefined) item.ok = r.ok;
    if (r.statusCode !== undefined) item.statusCode = r.statusCode;
    if (r.errMsg !== undefined) item.errMsg = r.errMsg;
    if (r.header !== undefined) item.header = trunc(r.header);
    if (r.data !== undefined) item.data = trunc(r.data);
    if (r.response !== undefined) item.response = trunc(r.response);
    out.push(item);
    if (out.length >= cap) break;
  }
  return out;
}`;

/** 清空日志（不卸载拦截器） */
const NETWORK_CLEAR_FN = `function () {
  globalThis.__mcpNetLog = [];
  return { cleared: true };
}`;

export function registerMiniProgramTools(server: McpServer): void {
  // ---------------- 小程序级操作 ----------------
  server.registerTool(
    'page_stack',
    { description: '获取当前页面栈（所有已打开页面，并注册 page_id 句柄）' },
    wrap(async () => {
      const mp = requireMiniProgram();
      const stack = await mp.pageStack();
      return { pages: stack.map((p) => registerPage(p)) };
    })
  );

  server.registerTool(
    'navigate_to',
    {
      description: '跳转到应用内非 tabBar 页面',
      inputSchema: {
        url: z.string().describe('需要跳转的应用内非 tabBar 页面路径，如 /pages/xxx/index'),
      },
    },
    wrap(async ({ url }: { url: string }) => {
      const mp = requireMiniProgram();
      const page = await mp.navigateTo(url);
      return registerPage(page);
    })
  );

  server.registerTool(
    'redirect_to',
    {
      description: '重定向到应用内非 tabBar 页面（关闭当前页面，替换栈顶）',
      inputSchema: {
        url: z.string().describe('需要跳转的应用内非 tabBar 页面路径'),
      },
    },
    wrap(async ({ url }: { url: string }) => {
      const mp = requireMiniProgram();
      const page = await mp.redirectTo(url);
      return registerPage(page);
    })
  );

  server.registerTool(
    'navigate_back',
    { description: '返回上一页面' },
    wrap(async () => {
      const mp = requireMiniProgram();
      const page = await mp.navigateBack();
      return registerPage(page);
    })
  );

  server.registerTool(
    're_launch',
    {
      description: '关闭所有页面并重新打开指定页面',
      inputSchema: {
        url: z.string().describe('需要打开的应用内页面路径'),
      },
    },
    wrap(async ({ url }: { url: string }) => {
      const mp = requireMiniProgram();
      const page = await mp.reLaunch(url);
      return registerPage(page);
    })
  );

  server.registerTool(
    'switch_tab',
    {
      description: '切换到 tabBar 页面（url 需以 / 开头）',
      inputSchema: {
        url: z.string().describe('需要跳转的 tabBar 页面路径'),
      },
    },
    wrap(async ({ url }: { url: string }) => {
      const mp = requireMiniProgram();
      const page = await mp.switchTab(url);
      return registerPage(page);
    })
  );

  server.registerTool(
    'current_page',
    { description: '获取当前活动页面（返回 page_id 句柄）' },
    wrap(async () => {
      const mp = requireMiniProgram();
      const page = await mp.currentPage();
      return registerPage(page);
    })
  );

  server.registerTool(
    'system_info',
    { description: '获取小程序运行环境系统信息（机型、系统版本、微信版本等）' },
    wrap(async () => {
      const mp = requireMiniProgram();
      return { system_info: await mp.systemInfo() };
    })
  );

  server.registerTool(
    'call_wx_method',
    {
      description: '在 AppService 中调用 wx 全局方法并返回结果',
      inputSchema: {
        method: z.string().describe('需要调用的 wx 方法名，如 getStorageSync / setStorage'),
        args: z.array(z.any()).optional().describe('方法参数（异步方法无需传 success/fail 回调）'),
      },
    },
    wrap(async ({ method, args }: { method: string; args?: unknown[] }) => {
      const mp = requireMiniProgram();
      return { result: await mp.callWxMethod(method, ...(args ?? [])) };
    })
  );

  server.registerTool(
    'mock_wx_method',
    {
      description: '覆盖 wx 方法并返回固定结果（用于模拟第三方依赖）',
      inputSchema: {
        method: z.string().describe('需要覆盖的 wx 方法名'),
        result: z.any().describe('指定调用结果'),
      },
    },
    wrap(async ({ method, result }: { method: string; result: unknown }) => {
      const mp = requireMiniProgram();
      await mp.mockWxMethod(method, result);
      return { ok: true, message: `wx.${method} 已被 mock 为固定返回值` };
    })
  );

  server.registerTool(
    'restore_wx_method',
    {
      description: '恢复被 mock 的 wx 方法为原始实现',
      inputSchema: {
        method: z.string().describe('需要重置的 wx 方法名'),
      },
    },
    wrap(async ({ method }: { method: string }) => {
      const mp = requireMiniProgram();
      await mp.restoreWxMethod(method);
      return { ok: true, message: `wx.${method} 已恢复原始实现` };
    })
  );

  server.registerTool(
    'evaluate',
    {
      description: '注入函数源码在 AppService 中执行并返回结果（可访问 getApp/getCurrentPages 等全局）',
      inputSchema: {
        code: z
          .string()
          .describe('注入 AppService 执行的函数源码字符串，如 function() { return getApp().globalData.userInfo }'),
        args: z.array(z.any()).optional().describe('执行时传入函数的参数'),
      },
    },
    wrap(async ({ code, args }: { code: string; args?: unknown[] }) => {
      const mp = requireMiniProgram();
      return { result: await mp.evaluate(code, ...(args ?? [])) };
    })
  );

  server.registerTool(
    'network_start',
    {
      description: '在 AppService 中给 wx.request 挂上透传拦截器，开始记录网络请求（幂等；只捕获安装后的请求，上限 500 条，跨页面存活；拦截器不改请求参数，对业务无影响）',
    },
    wrap(async () => {
      const mp = requireMiniProgram();
      return { result: await mp.evaluate(NETWORK_HOOK_FN) };
    })
  );

  server.registerTool(
    'network_log',
    {
      description: '获取已记录的 wx.request 请求日志（按时间倒序返回最新的 limit 条；大字段如响应体自动截断到 2000 字符；未调用 network_start 时返回空数组）',
      inputSchema: {
        filter: z.string().optional().describe('按 url 包含匹配过滤'),
        limit: z.number().int().min(1).max(100).optional().describe('最多返回条数，默认 50'),
      },
    },
    wrap(async ({ filter, limit }: { filter?: string; limit?: number }) => {
      const mp = requireMiniProgram();
      return { requests: await mp.evaluate(NETWORK_READ_FN, filter ?? '', limit ?? 50) };
    })
  );

  server.registerTool(
    'network_clear',
    {
      description: '清空已记录的 wx.request 网络请求日志（不卸载拦截器，后续请求仍会继续记录）',
    },
    wrap(async () => {
      const mp = requireMiniProgram();
      return { result: await mp.evaluate(NETWORK_CLEAR_FN) };
    })
  );

  server.registerTool(
    'page_scroll_to',
    {
      description: '将当前页面滚动到指定位置',
      inputSchema: {
        scrollTop: z.number().describe('滚动到页面的目标位置，单位 px'),
      },
    },
    wrap(async ({ scrollTop }: { scrollTop: number }) => {
      const mp = requireMiniProgram();
      await mp.pageScrollTo(scrollTop);
      return { ok: true };
    })
  );

  server.registerTool(
    'screenshot',
    {
      description: '对小程序当前页面截图（传 path 保存到文件，否则返回图片 base64；截图可能达数 MB，建议传 path 保存文件，避免大 payload 超出客户端消息限制）',
      inputSchema: {
        path: z.string().optional().describe('图片保存路径，不传则返回图片 base64 编码'),
      },
    },
    wrap(async ({ path }: { path?: string }) => {
      const mp = requireMiniProgram();
      if (path) {
        await mp.screenshot({ path });
        return { ok: true, path };
      }
      return { image_base64: await mp.screenshot() };
    })
  );

  server.registerTool(
    'get_ticket',
    { description: '获取开发者工具登录票据（有效期两小时；返回结构依赖 IDE，可能为字符串或 {ticket: ...} 嵌套对象，以实际返回为准）' },
    wrap(async () => {
      const mp = requireMiniProgram();
      return { result: await mp.getTicket() };
    })
  );

  server.registerTool(
    'set_ticket',
    {
      description: '设置开发者工具登录票据',
      inputSchema: {
        ticket: z.string().describe('登录票据'),
      },
    },
    wrap(async ({ ticket }: { ticket: string }) => {
      const mp = requireMiniProgram();
      await mp.setTicket(ticket);
      return { ok: true };
    })
  );

  server.registerTool(
    'refresh_ticket',
    { description: '刷新登录票据（过期时间重置为两小时）' },
    wrap(async () => {
      const mp = requireMiniProgram();
      await mp.refreshTicket();
      return { ok: true, message: '票据已刷新，过期时间重置为两小时' };
    })
  );

  // ---------------- 运行日志 ----------------
  server.registerTool(
    'console_messages',
    { description: '获取小程序运行产生的控制台日志（连接后自动收集，最多 500 条）' },
    wrap(async () => {
      return { messages: getConsoleLogs() };
    })
  );

  server.registerTool(
    'exception_messages',
    { description: '获取小程序运行产生的异常日志（连接后自动收集，最多 500 条）' },
    wrap(async () => {
      return { exceptions: getExceptions() };
    })
  );

  server.registerTool(
    'clear_event_logs',
    { description: '清空已收集的控制台日志与异常记录' },
    wrap(async () => {
      clearEventLogs();
      return { ok: true };
    })
  );
}

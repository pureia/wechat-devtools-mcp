import type { MiniProgram, Page } from 'miniprogram-automator';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { McpError } from './errors.js';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function ok(data: unknown): CallToolResult {
  const text = data === undefined ? '' : JSON.stringify(data, null, 2);
  return { content: [{ type: 'text', text }] };
}

/**
 * 按消息模式回退到错误码/hint（兼容历史抛错与 SDK 英文错误）。
 * 仅处理不带 code 的普通 Error；McpError 等自带 code 的错误由 fail() 直通，不经此函数。
 * 抽出为纯函数，便于脱离真实连接确定性断言（scripts/classify-check.mjs）。
 */
export function classifyError(message: string): { code: string; hint: string } {
  if (/尚未连接小程序/.test(message)) {
    return { code: 'NOT_CONNECTED', hint: '请先调用 launch 或 connect 建立连接' };
  }
  if (/page_id 无效/.test(message)) {
    return { code: 'INVALID_PAGE', hint: '可重新调用 current_page / page_stack 获取有效句柄' };
  }
  if (/element_id 无效/.test(message)) {
    return { code: 'INVALID_ELEMENT', hint: '可重新调用 page_query 获取有效句柄' };
  }
  if (/已存在连接/.test(message)) {
    return { code: 'INVALID_STATE', hint: '请先调用 close 或 disconnect 释放当前连接，再执行 launch / connect' };
  }
  if (/\.(?:scrollTo|input|callContextMethod|callMethod|swipeTo|moveTo|slideTo) is not a function/.test(message)) {
    return { code: 'INVALID_ELEMENT', hint: '元素类型不支持该操作（如 scrollTo 仅 scroll-view、input 仅 input/textarea、callContextMethod 仅 video），请核对元素类型或更换目标元素' };
  }
  if (/Failed connecting to/.test(message)) {
    return { code: 'CONNECTION_LOST', hint: '请确认开发者工具项目窗口已打开且「设置->安全设置->服务端口」已开启，或检查 wsEndpoint 端口是否正确' };
  }
  if (/Connection closed|connection is closed/.test(message)) {
    return { code: 'CONNECTION_LOST', hint: '开发者工具可能被关闭或崩溃，请调用 close/disconnect 后重新 launch/connect，或重启 MCP 服务器' };
  }
  if (/启动微信开发者工具失败|未找到微信开发者工具 cli|cli 已退出/.test(message)) {
    return { code: 'CLI_START_FAILED', hint: '请检查 cliPath 是否正确、开发者工具「设置->安全设置->服务端口」是否开启' };
  }
  if (/超时/.test(message)) {
    return { code: 'TIMEOUT', hint: '请检查前置条件是否满足（小程序已编译运行、元素存在等），或增大 timeout 参数' };
  }
  return { code: 'UNKNOWN', hint: '' };
}

export function fail(err: unknown): CallToolResult {
  const message = err instanceof Error ? err.message : String(err);
  const { code: errCode, hint: errHint } = (err ?? {}) as { code?: string; hint?: string };
  const { code, hint } = errCode ? { code: errCode, hint: errHint ?? '' } : classifyError(message);
  const text = JSON.stringify({ success: false, error_code: code, message, hint }, null, 2);
  return {
    isError: true,
    content: [{ type: 'text', text }],
  };
}

/** 统一包装：连接态校验 + 执行 + 错误转 MCP 错误结果 */
export function wrap<TArgs>(
  fn: (args: TArgs) => Promise<unknown>
): (args: TArgs) => Promise<CallToolResult> {
  return async (args) => {
    try {
      return ok(await fn(args));
    }
    catch (err) {
      return fail(err);
    }
  };
}

export async function safeCurrentPage(mp: MiniProgram, timeoutMs = 30000): Promise<Page> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const page = await Promise.race([
      mp.currentPage(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('获取当前页面超时，请确认小程序已在开发者工具中编译运行')),
          timeoutMs
        );
      }),
    ]);
    if (!page) {
      throw new McpError('INVALID_PAGE', '未获取到当前页面实例', '请确认小程序已在开发者工具中编译运行');
    }
    return page;
  }
  finally {
    clearTimeout(timer);
  }
}

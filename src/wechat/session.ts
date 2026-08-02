import type { ConsoleMessage, Element, ExceptionMessage, MiniProgram, Page } from 'miniprogram-automator';
import type { ConsoleLogEntry, ElementHandle, ExceptionEntry, PageHandle } from '../types.js';
import { ERROR_CODES, McpError } from './errors.js';

let miniProgram: MiniProgram | null = null;
let connecting = false;
const pages = new Map<string, Page>();
const elements = new Map<string, Element>();
let pageSeq = 0;
let elementSeq = 0;
const consoleLogs: ConsoleLogEntry[] = [];
const exceptions: ExceptionEntry[] = [];
// 句柄数量上限：防止长时间运行的 MCP 会话中 page/element 句柄无限增长。
// 超限时按 FIFO 淘汰最旧句柄（Map 迭代顺序即插入顺序）。
const MAX_PAGE_HANDLES = 500;
const MAX_ELEMENT_HANDLES = 1000;

function evictOldest<K, V>(map: Map<K, V>, max: number): void {
  if (map.size < max) return;
  const oldest = map.keys().next().value;
  if (oldest !== undefined) map.delete(oldest);
}

export function hasMiniProgram(): boolean {
  return miniProgram !== null;
}

export function isConnecting(): boolean {
  return connecting;
}

export function setConnecting(value: boolean): void {
  connecting = value;
}

export function getMiniProgram(): MiniProgram | null {
  return miniProgram;
}

export function setMiniProgram(mp: MiniProgram | null): void {
  miniProgram = mp;
}

export function requireMiniProgram(): MiniProgram {
  if (!miniProgram) {
    throw new McpError('NOT_CONNECTED', ERROR_CODES.NOT_CONNECTED, '请先调用 launch 或 connect 建立连接');
  }
  return miniProgram;
}

export function requirePage(pageId: string): Page {
  const page = pages.get(pageId);
  if (!page) {
    throw new McpError('INVALID_PAGE', `page_id 无效或已失效: ${pageId}`, '可重新调用 current_page / page_stack 获取有效句柄');
  }
  return page;
}

export function requireElement(elementId: string): Element {
  const el = elements.get(elementId);
  if (!el) {
    throw new McpError('INVALID_ELEMENT', `element_id 无效或已失效: ${elementId}`, '可重新调用 page_query 获取有效句柄');
  }
  return el;
}

export function registerPage(page: Page | undefined): PageHandle {
  if (!page) {
    throw new McpError('INVALID_PAGE', '未获取到页面实例（路由可能跳转失败）', '可调用 page_stack / current_page 查看当前页面栈');
  }
  evictOldest(pages, MAX_PAGE_HANDLES);
  const id = `page_${++pageSeq}`;
  pages.set(id, page);
  return { page_id: id, path: page.path, query: page.query ?? {} };
}

export function registerElement(el: Element | undefined | null): ElementHandle {
  if (!el) {
    throw new McpError('INVALID_ELEMENT', '未获取到元素实例', '可重新调用 page_query / page_query_all 获取有效句柄');
  }
  evictOldest(elements, MAX_ELEMENT_HANDLES);
  const id = `el_${++elementSeq}`;
  elements.set(id, el);
  return { element_id: id, tagName: el.tagName };
}

export function registerElements(els: Element[]): ElementHandle[] {
  // 批量注册前一次性腾出所需空间，避免本批次靠前句柄被末尾注册立即 FIFO 淘汰
  const overflow = els.length - (MAX_ELEMENT_HANDLES - elements.size);
  if (overflow > 0) {
    let removed = 0;
    for (const id of elements.keys()) {
      if (removed >= overflow) break;
      elements.delete(id);
      removed++;
    }
  }
  return els.map((el) => registerElement(el));
}

export function registerEventHandlers(mp: MiniProgram): void {
  mp.on('console', (msg: ConsoleMessage) => {
    consoleLogs.push({ time: new Date().toISOString(), type: msg.type, args: msg.args });
    if (consoleLogs.length > 500) consoleLogs.shift();
  });
  mp.on('exception', (err: ExceptionMessage) => {
    exceptions.push({ time: new Date().toISOString(), message: err.message, stack: err.stack });
    if (exceptions.length > 500) exceptions.shift();
  });
}

export function resetSession(): void {
  miniProgram = null;
  pages.clear();
  elements.clear();
  pageSeq = 0;
  elementSeq = 0;
  consoleLogs.length = 0;
  exceptions.length = 0;
}

export function clearHandles(scope: 'elements' | 'pages' | 'all'): void {
  if (scope !== 'elements') pages.clear();
  if (scope !== 'pages') elements.clear();
}

export function getConsoleLogs(): ConsoleLogEntry[] {
  return consoleLogs;
}

export function getExceptions(): ExceptionEntry[] {
  return exceptions;
}

export function clearEventLogs(): void {
  consoleLogs.length = 0;
  exceptions.length = 0;
}

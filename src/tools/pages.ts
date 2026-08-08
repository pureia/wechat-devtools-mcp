import type { Element, Page } from 'miniprogram-automator';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WxmlNode } from '../wechat/wxml.js';
import { z } from 'zod';
import { parseWxml } from '../wechat/wxml.js';
import { truncate, wrap } from '../wechat/utils.js';
import { registerElement, registerElements, requirePage } from '../wechat/session.js';

export function registerPageTools(server: McpServer): void {
  // ---------------- 页面级操作 ----------------
  server.registerTool(
    'page_query',
    {
      description: '在页面中按 WXSS 选择器查询首个匹配元素（返回 element_id 句柄）',
      inputSchema: {
        page_id: z.string(),
        selector: z.string().describe('WXSS 选择器，仅支持部分 CSS 选择器'),
      },
    },
    wrap(async ({ page_id, selector }: { page_id: string; selector: string }) => {
      const page = requirePage(page_id);
      const el = await page.$(selector);
      return el ? registerElement(el) : { element_id: null, message: '未找到匹配元素' };
    })
  );

  server.registerTool(
    'page_query_all',
    {
      description: '在页面中按 WXSS 选择器查询所有匹配元素（返回 element_id 句柄数组；超 1000 个时仅末尾 1000 个句柄可用）',
      inputSchema: {
        page_id: z.string(),
        selector: z.string().describe('WXSS 选择器'),
      },
    },
    wrap(async ({ page_id, selector }: { page_id: string; selector: string }) => {
      const page = requirePage(page_id);
      const els = await page.$$(selector);
      return { count: els.length, elements: registerElements(els) };
    })
  );

  server.registerTool(
    'page_query_xpath',
    {
      description: '在页面中按 XPath 表达式查询首个匹配元素（返回 element_id 句柄）',
      inputSchema: {
        page_id: z.string(),
        xpath: z.string().describe('XPath 表达式（选择元素节点），如 //view[contains(@class, "header")]'),
      },
    },
    wrap(async ({ page_id, xpath }: { page_id: string; xpath: string }) => {
      const page = requirePage(page_id);
      const el = await page.getElementByXpath(xpath);
      return el ? registerElement(el) : { element_id: null, message: '未找到匹配元素' };
    })
  );

  server.registerTool(
    'page_query_xpath_all',
    {
      description: '在页面中按 XPath 表达式查询所有匹配元素（返回 element_id 句柄数组；超 1000 个时仅末尾 1000 个句柄可用）',
      inputSchema: {
        page_id: z.string(),
        xpath: z.string().describe('XPath 表达式'),
      },
    },
    wrap(async ({ page_id, xpath }: { page_id: string; xpath: string }) => {
      const page = requirePage(page_id);
      const els = await page.getElementsByXpath(xpath);
      return { count: els.length, elements: registerElements(els) };
    })
  );

  server.registerTool(
    'page_tree',
    {
      description: '获取页面紧凑结构树：节点带 tag / class / id / 文本摘要 / 节点路径 / 子节点数，叶子节点附屏幕坐标；路径不含 page 包裹节点、可直接作为 XPath 使用；文本来自 WXML 快照，插值（{{}}）绑定的文本可能为空，需按文本检索时用 page_query_by_text；复杂页可用 path 下钻，节点数或深度超限时以 truncated 标记并建议用 path 下钻',
      inputSchema: {
        page_id: z.string(),
        path: z.string().optional().describe('下钻子树：与返回的 path 同格式的节点路径（可直接作 XPath），如 /view[1]'),
        depth: z.number().int().min(1).max(20).optional().describe('最大展开深度，默认 10'),
        include_offset: z.boolean().optional().describe('叶子节点是否附屏幕坐标（每个叶子一次查询，复杂页会慢），默认 true'),
        max_nodes: z.number().int().min(1).max(2000).optional().describe('节点总数上限，默认 400，超出截断'),
      },
    },
    wrap(async ({ page_id, path, depth = 10, include_offset = true, max_nodes = 400 }: { page_id: string; path?: string; depth?: number; include_offset?: boolean; max_nodes?: number }) => {
      const page = requirePage(page_id);
      const root = await getPageRoot(page);
      if (!root) return { tree: null, message: '未获取到页面根节点（page 选择器与 /page XPath 均未命中）' };
      const parsed = parseWxml(await root.outerWxml());
      if (!parsed) return { tree: null, message: '页面 WXML 解析失败' };
      let target = parsed;
      let targetPath = '';
      if (path) {
        // 无前导斜杠的输入（如 page/view[1]）先规范化为绝对路径，保证子树路径可直接作为 XPath
        if (!path.startsWith('/')) path = `/${path}`;
        const found = findNodeByPath(parsed, path);
        if (!found) return { tree: null, message: `未找到节点路径 ${path}，可重新调用 page_tree 获取最新路径` };
        target = found;
        // 兼容旧格式首段（page）时归一化，保证子树路径可直接作为 XPath
        targetPath = path.replace(new RegExp(`^/${parsed.tagName}(?:\\[\\d+\\])?(?=/|$)`), '');
      }
      const state: WalkState = { emitted: 0, truncated: false };
      const tree = await walkNode(page, target, targetPath, 0, { includeOffset: include_offset, depthLimit: depth, maxNodes: max_nodes }, state);
      return { tree, truncated: state.truncated };
    })
  );

  server.registerTool(
    'page_query_by_text',
    {
      description: '按文本内容搜索页面元素：返回可操作句柄 + 节点路径 + 文本摘要 + 屏幕坐标（XPath 解析失败时句柄为 null，仅返回元数据）；最多返回前 limit 个匹配。WXML 快照中插值绑定的文本可能为空（IDE 限制），此时自动降级逐叶子读取 innerText 匹配（最多扫描 400 个叶子），结果以 fallback_used 标记',
      inputSchema: {
        page_id: z.string(),
        text: z.string().describe('文本关键字（包含即匹配，不区分大小写）'),
        limit: z.number().int().min(1).max(50).optional().describe('最多返回匹配数，默认 10'),
      },
    },
    wrap(async ({ page_id, text, limit = 10 }: { page_id: string; text: string; limit?: number }) => {
      const page = requirePage(page_id);
      const root = await getPageRoot(page);
      if (!root) return { results: [], fallback_used: false, message: '未获取到页面根节点' };
      const parsed = parseWxml(await root.outerWxml());
      if (!parsed) return { results: [], fallback_used: false, message: '页面 WXML 解析失败' };
      let matches = collectTextMatches(parsed, text, limit);
      const fallbackUsed = matches.length === 0;
      if (fallbackUsed) {
        matches = await collectTextMatchesByInnerText(page, parsed, text, limit, 400);
      }
      const results: Array<{ element_id: string | null; path: string; text: string; offset?: { left: number; top: number } }> = [];
      for (const m of matches) {
        let element_id: string | null = null;
        let offset: { left: number; top: number } | undefined;
        try {
          const el = await page.getElementByXpath(m.path);
          if (el) {
            element_id = registerElement(el).element_id;
            const off = await el.offset();
            if (off && typeof off.left === 'number' && typeof off.top === 'number') {
              offset = { left: off.left, top: off.top };
            }
          }
        }
        catch {
          // XPath 解析失败：句柄保持 null，仅返回元数据
        }
        results.push({ element_id, path: m.path, text: m.text, ...(offset ? { offset } : {}) });
      }
      return { results, fallback_used: fallbackUsed };
    })
  );

  server.registerTool(
    'page_call_method',
    {
      description: '调用页面实例方法（含 onPullDownRefresh 等事件方法与自定义方法）',
      inputSchema: {
        page_id: z.string(),
        method: z.string().describe('页面实例方法名，如 onPullDownRefresh / 自定义方法'),
        args: z.array(z.any()).optional().describe('方法参数'),
      },
    },
    wrap(async ({ page_id, method, args }: { page_id: string; method: string; args?: unknown[] }) => {
      const page = requirePage(page_id);
      return { result: await page.callMethod(method, ...(args ?? [])) };
    })
  );

  server.registerTool(
    'page_wait_for',
    {
      description: '等待条件满足：数字=等待毫秒数，字符串=等待元素选择器出现',
      inputSchema: {
        page_id: z.string(),
        condition: z
          .union([z.number(), z.string()])
          .describe('等待条件：数字为等待毫秒数；字符串为选择器，元素出现即结束等待'),
        timeout: z.number().int().positive().optional().describe('最长等待时间(ms)，默认 30000，超时抛错避免永久挂起'),
      },
    },
    wrap(async ({ page_id, condition, timeout = 30000 }: { page_id: string; condition: number | string; timeout?: number }) => {
      const page = requirePage(page_id);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          page.waitFor(condition),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error(`waitFor 等待超时(${timeout}ms)，请检查条件是否正确`)),
              timeout
            );
          }),
        ]);
      }
      finally {
        clearTimeout(timer);
      }
      return { ok: true, condition_met: true };
    })
  );

  server.registerTool(
    'page_data',
    {
      description: '获取页面渲染数据（可指定路径，不传返回全部）',
      inputSchema: {
        page_id: z.string(),
        path: z.string().optional().describe('数据路径，如 list，不传返回全部渲染数据'),
      },
    },
    wrap(async ({ page_id, path }: { page_id: string; path?: string }) => {
      const page = requirePage(page_id);
      return { data: await page.data(path) };
    })
  );

  server.registerTool(
    'page_set_data',
    {
      description: '修改页面渲染数据（直接改 data，不触发组件响应式更新，适合调试）',
      inputSchema: {
        page_id: z.string(),
        data: z.record(z.string(), z.any()).describe('要改变的数据对象'),
      },
    },
    wrap(async ({ page_id, data }: { page_id: string; data: Record<string, unknown> }) => {
      const page = requirePage(page_id);
      await page.setData(data);
      return { ok: true };
    })
  );

  server.registerTool(
    'page_size',
    {
      description: '获取页面尺寸（宽高）',
      inputSchema: {
        page_id: z.string(),
      },
    },
    wrap(async ({ page_id }: { page_id: string }) => {
      const page = requirePage(page_id);
      return { size: await page.size() };
    })
  );

  server.registerTool(
    'page_scroll_top',
    {
      description: '获取页面滚动位置（scrollTop）',
      inputSchema: {
        page_id: z.string(),
      },
    },
    wrap(async ({ page_id }: { page_id: string }) => {
      const page = requirePage(page_id);
      return { scroll_top: await page.scrollTop() };
    })
  );
}

// ---------------- page_tree / page_query_by_text 共用辅助 ----------------

interface TreeItem {
  tag: string;
  path?: string;
  class?: string;
  id?: string;
  text?: string;
  child_count: number;
  offset?: { left: number; top: number };
  children: TreeItem[];
}

interface WalkOptions {
  includeOffset: boolean;
  depthLimit: number;
  maxNodes: number;
}

interface WalkState {
  emitted: number;
  truncated: boolean;
}

/** 页面根节点：优先 page 标签选择器（实机验证可用），回退 /page XPath（实机验证不命中，仅防御保留，见 ADR-0006） */
async function getPageRoot(page: Page): Promise<Element | null> {
  const byTag = await page.$('page');
  if (byTag) return byTag;
  return page.getElementByXpath('/page');
}

function stepIndex(step: string): { tag: string; index: number } | null {
  const m = /^([^[]+)(?:\[(\d+)\])?$/.exec(step);
  if (!m) return null;
  return { tag: m[1]!, index: m[2] ? Number(m[2]) : 1 };
}

/** 按节点路径从解析树中取节点。路径为 XPath 风格（同标签兄弟 1 基计数），不含 page 包裹节点；兼容旧格式首段为 page */
function findNodeByPath(root: WxmlNode, path: string): WxmlNode | null {
  const steps = path.split('/').filter(Boolean);
  if (steps.length > 0) {
    const first = stepIndex(steps[0] ?? '');
    if (first && first.tag === root.tagName) steps.shift();
  }
  let node = root;
  for (const step of steps) {
    const s = stepIndex(step);
    if (!s) return null;
    const siblings = node.children.filter((c) => c.tagName === s.tag);
    const child = siblings[s.index - 1];
    if (!child) return null;
    node = child;
  }
  return node;
}

/** 按节点路径解析元素坐标；IDE XPath 不支持按名选择根包裹节点（page），故路径不含首段 */
async function resolveOffset(page: Page, path: string): Promise<{ left: number; top: number } | null> {
  if (!path) return null;
  try {
    const el = await page.getElementByXpath(path);
    if (!el) return null;
    const offset = await el.offset();
    if (offset && typeof offset.left === 'number' && typeof offset.top === 'number') {
      return { left: offset.left, top: offset.top };
    }
    return null;
  }
  catch {
    return null;
  }
}

async function walkNode(
  page: Page,
  node: WxmlNode,
  path: string,
  depth: number,
  opts: WalkOptions,
  state: WalkState
): Promise<TreeItem | null> {
  if (state.emitted >= opts.maxNodes) {
    state.truncated = true;
    return null;
  }
  state.emitted++;
  const item: TreeItem = { tag: node.tagName, child_count: node.children.length, children: [] };
  if (path) item.path = path;
  if (node.attributes.class) item.class = node.attributes.class;
  if (node.attributes.id) item.id = node.attributes.id;
  if (node.text) item.text = truncate(node.text, 30);
  if (depth < opts.depthLimit) {
    item.children = await walkChildren(page, node.children, path, depth + 1, opts, state);
  }
  else if (node.children.length > 0) {
    state.truncated = true;
  }
  if (opts.includeOffset && node.children.length === 0) {
    item.offset = (await resolveOffset(page, path)) ?? undefined;
  }
  return item;
}

async function walkChildren(
  page: Page,
  children: WxmlNode[],
  parentPath: string,
  depth: number,
  opts: WalkOptions,
  state: WalkState
): Promise<TreeItem[]> {
  const counts = new Map<string, number>();
  const items: TreeItem[] = [];
  for (const child of children) {
    const idx = (counts.get(child.tagName) ?? 0) + 1;
    counts.set(child.tagName, idx);
    const path = `${parentPath}/${child.tagName}[${idx}]`;
    const item = await walkNode(page, child, path, depth, opts, state);
    if (item) items.push(item);
  }
  return items;
}

interface TextMatch {
  path: string;
  text: string;
}

function collectTextMatches(node: WxmlNode, query: string, limit: number): TextMatch[] {
  const results: TextMatch[] = [];
  const q = query.toLowerCase();
  const visit = (n: WxmlNode, path: string): void => {
    if (results.length >= limit) return;
    if (n.text && n.text.toLowerCase().includes(q)) {
      results.push({ path, text: truncate(n.text, 50) });
    }
    const counts = new Map<string, number>();
    for (const child of n.children) {
      if (results.length >= limit) return;
      const idx = (counts.get(child.tagName) ?? 0) + 1;
      counts.set(child.tagName, idx);
      visit(child, `${path}/${child.tagName}[${idx}]`);
    }
  };
  // 根包裹节点（page）不可用 XPath 选择，从其子节点开始，路径可直接作为 XPath
  const counts = new Map<string, number>();
  for (const child of node.children) {
    const idx = (counts.get(child.tagName) ?? 0) + 1;
    counts.set(child.tagName, idx);
    visit(child, `/${child.tagName}[${idx}]`);
  }
  return results;
}

/**
 * WXML 快照的插值（{{}}）文本可能为空（IDE 限制），此时降级为逐叶子读取 innerText 匹配。
 * maxScan 限制扫描叶子数，避免复杂页产生过多 RPC。
 */
async function collectTextMatchesByInnerText(
  page: Page,
  root: WxmlNode,
  query: string,
  limit: number,
  maxScan: number
): Promise<TextMatch[]> {
  const results: TextMatch[] = [];
  const q = query.toLowerCase();
  let scanned = 0;
  const visit = async (n: WxmlNode, path: string): Promise<void> => {
    if (results.length >= limit || scanned >= maxScan) return;
    if (n.children.length === 0) {
      scanned++;
      try {
        const el = await page.getElementByXpath(path);
        if (el) {
          const t = (await el.text()) ?? '';
          if (t.trim() && t.toLowerCase().includes(q)) {
            results.push({ path, text: truncate(t.trim(), 50) });
          }
        }
      }
      catch {
        // XPath 解析失败则跳过该叶子
      }
    }
    const counts = new Map<string, number>();
    for (const child of n.children) {
      if (results.length >= limit || scanned >= maxScan) return;
      const idx = (counts.get(child.tagName) ?? 0) + 1;
      counts.set(child.tagName, idx);
      await visit(child, `${path}/${child.tagName}[${idx}]`);
    }
  };
  const counts = new Map<string, number>();
  for (const child of root.children) {
    const idx = (counts.get(child.tagName) ?? 0) + 1;
    counts.set(child.tagName, idx);
    await visit(child, `/${child.tagName}[${idx}]`);
  }
  return results;
}

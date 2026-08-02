import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrap } from '../wechat/utils.js';
import { registerElement, requirePage } from '../wechat/session.js';

export function registerPageTools(server: McpServer): void {
  // ---------------- 页面级操作 ----------------
  server.tool(
    'page_query',
    '在页面中按 WXSS 选择器查询首个匹配元素（返回 element_id 句柄）',
    { page_id: z.string(), selector: z.string().describe('WXSS 选择器，仅支持部分 CSS 选择器') },
    wrap(async ({ page_id, selector }: { page_id: string; selector: string }) => {
      const page = requirePage(page_id);
      const el = await page.$(selector);
      return el ? registerElement(el) : { element_id: null, message: '未找到匹配元素' };
    })
  );

  server.tool(
    'page_query_all',
    '在页面中按 WXSS 选择器查询所有匹配元素（返回 element_id 句柄数组）',
    { page_id: z.string(), selector: z.string().describe('WXSS 选择器') },
    wrap(async ({ page_id, selector }: { page_id: string; selector: string }) => {
      const page = requirePage(page_id);
      const els = await page.$$(selector);
      return { count: els.length, elements: els.map((el) => registerElement(el)) };
    })
  );

  server.tool(
    'page_wait_for',
    '等待条件满足：数字=等待毫秒数，字符串=等待元素选择器出现',
    {
      page_id: z.string(),
      condition: z
        .union([z.number(), z.string()])
        .describe('等待条件：数字为等待毫秒数；字符串为选择器，元素出现即结束等待'),
      timeout: z.number().int().positive().optional().describe('最长等待时间(ms)，默认 30000，超时抛错避免永久挂起'),
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

  server.tool(
    'page_data',
    '获取页面渲染数据（可指定路径，不传返回全部）',
    { page_id: z.string(), path: z.string().optional().describe('数据路径，如 list，不传返回全部渲染数据') },
    wrap(async ({ page_id, path }: { page_id: string; path?: string }) => {
      const page = requirePage(page_id);
      return { data: await page.data(path) };
    })
  );

  server.tool(
    'page_set_data',
    '修改页面渲染数据（直接改 data，不触发组件响应式更新，适合调试）',
    { page_id: z.string(), data: z.record(z.string(), z.any()).describe('要改变的数据对象') },
    wrap(async ({ page_id, data }: { page_id: string; data: Record<string, unknown> }) => {
      const page = requirePage(page_id);
      await page.setData(data);
      return { ok: true };
    })
  );

  server.tool(
    'page_size',
    '获取页面尺寸（宽高）',
    { page_id: z.string() },
    wrap(async ({ page_id }: { page_id: string }) => {
      const page = requirePage(page_id);
      return { size: await page.size() };
    })
  );

  server.tool(
    'page_scroll_top',
    '获取页面滚动位置（scrollTop）',
    { page_id: z.string() },
    wrap(async ({ page_id }: { page_id: string }) => {
      const page = requirePage(page_id);
      return { scroll_top: await page.scrollTop() };
    })
  );
}

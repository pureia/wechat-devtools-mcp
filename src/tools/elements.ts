import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrap } from '../wechat/utils.js';
import { registerElement, requireElement } from '../wechat/session.js';

export function registerElementTools(server: McpServer): void {
  // ---------------- 元素级操作 ----------------
  server.tool(
    'element_query',
    '在元素内按 WXSS 选择器查询首个匹配子元素',
    { element_id: z.string(), selector: z.string().describe('WXSS 选择器') },
    wrap(async ({ element_id, selector }: { element_id: string; selector: string }) => {
      const el = requireElement(element_id);
      const child = await el.$(selector);
      return child ? registerElement(child) : { element_id: null, message: '未找到匹配元素' };
    })
  );

  server.tool(
    'element_query_all',
    '在元素内按 WXSS 选择器查询所有匹配子元素',
    { element_id: z.string(), selector: z.string().describe('WXSS 选择器') },
    wrap(async ({ element_id, selector }: { element_id: string; selector: string }) => {
      const el = requireElement(element_id);
      const els = await el.$$(selector);
      return { count: els.length, elements: els.map((child) => registerElement(child)) };
    })
  );

  server.tool(
    'element_text',
    '获取元素文本内容',
    { element_id: z.string() },
    wrap(async ({ element_id }: { element_id: string }) => {
      const el = requireElement(element_id);
      return { text: await el.text() };
    })
  );

  server.tool(
    'element_attribute',
    '获取元素特性值（如 class / id / src）',
    { element_id: z.string(), name: z.string().describe('特性名，如 class / id / src') },
    wrap(async ({ element_id, name }: { element_id: string; name: string }) => {
      const el = requireElement(element_id);
      return { value: await el.attribute(name) };
    })
  );

  server.tool(
    'element_property',
    '获取元素属性值（如 input 组件的 value）',
    { element_id: z.string(), name: z.string().describe('属性名，如 input 组件的 value') },
    wrap(async ({ element_id, name }: { element_id: string; name: string }) => {
      const el = requireElement(element_id);
      return { value: await el.property(name) };
    })
  );

  server.tool(
    'element_value',
    '获取元素值（input/textarea 等表单组件）',
    { element_id: z.string() },
    wrap(async ({ element_id }: { element_id: string }) => {
      const el = requireElement(element_id);
      return { value: await el.value() };
    })
  );

  server.tool(
    'element_style',
    '获取元素样式值（如 color / fontSize）',
    { element_id: z.string(), name: z.string().describe('样式名，如 color / fontSize') },
    wrap(async ({ element_id, name }: { element_id: string; name: string }) => {
      const el = requireElement(element_id);
      return { value: await el.style(name) };
    })
  );

  server.tool(
    'element_size',
    '获取元素尺寸（宽高）',
    { element_id: z.string() },
    wrap(async ({ element_id }: { element_id: string }) => {
      const el = requireElement(element_id);
      return { size: await el.size() };
    })
  );

  server.tool(
    'element_offset',
    '获取元素位置偏移（相对视口）',
    { element_id: z.string() },
    wrap(async ({ element_id }: { element_id: string }) => {
      const el = requireElement(element_id);
      return { offset: await el.offset() };
    })
  );

  server.tool(
    'element_tap',
    '点击元素',
    { element_id: z.string() },
    wrap(async ({ element_id }: { element_id: string }) => {
      const el = requireElement(element_id);
      await el.tap();
      return { ok: true, message: '已点击元素' };
    })
  );

  server.tool(
    'element_longpress',
    '长按元素',
    { element_id: z.string() },
    wrap(async ({ element_id }: { element_id: string }) => {
      const el = requireElement(element_id);
      await el.longpress();
      return { ok: true, message: '已长按元素' };
    })
  );

  server.tool(
    'element_input',
    '向 input/textarea 组件输入文本',
    { element_id: z.string(), value: z.string().describe('需要输入的文本，仅 input/textarea 组件可用') },
    wrap(async ({ element_id, value }: { element_id: string; value: string }) => {
      const el = requireElement(element_id);
      await el.input(value);
      return { ok: true };
    })
  );

  server.tool(
    'element_trigger',
    '触发元素事件（如 change / blur）',
    {
      element_id: z.string(),
      type: z.string().describe('触发事件类型，如 change / blur'),
      detail: z.record(z.string(), z.any()).optional().describe('触发事件时传递的 detail 值'),
    },
    wrap(async ({ element_id, type, detail }: { element_id: string; type: string; detail?: Record<string, unknown> }) => {
      const el = requireElement(element_id);
      await el.trigger(type, detail);
      return { ok: true, message: `已触发事件 ${type}` };
    })
  );

  server.tool(
    'element_wxml',
    '获取元素 WXML 结构（默认内部 WXML，includeSelf=true 返回包含自身的 outerWXML）',
    {
      element_id: z.string(),
      includeSelf: z.boolean().optional().describe('为 true 时返回包含元素自身的 outerWXML，默认仅返回内部 WXML'),
    },
    wrap(async ({ element_id, includeSelf }: { element_id: string; includeSelf?: boolean }) => {
      const el = requireElement(element_id);
      return { wxml: includeSelf ? await el.outerWxml() : await el.wxml() };
    })
  );

  server.tool(
    'element_call_method',
    '调用自定义组件实例方法',
    {
      element_id: z.string(),
      method: z.string().describe('需要调用的组件实例方法名，仅自定义组件可用'),
      args: z.array(z.any()).optional().describe('方法参数'),
    },
    wrap(async ({ element_id, method, args }: { element_id: string; method: string; args?: unknown[] }) => {
      const el = requireElement(element_id);
      return { result: await el.callMethod(method, ...(args ?? [])) };
    })
  );

  server.tool(
    'element_data',
    '获取自定义组件 data（可指定路径，仅自定义组件可用）',
    { element_id: z.string(), path: z.string().optional().describe('数据路径，仅自定义组件可用') },
    wrap(async ({ element_id, path }: { element_id: string; path?: string }) => {
      const el = requireElement(element_id);
      return { data: await el.data(path) };
    })
  );

  server.tool(
    'element_set_data',
    '修改自定义组件 data（仅自定义组件可用）',
    { element_id: z.string(), data: z.record(z.string(), z.any()).describe('要改变的数据对象，仅自定义组件可用') },
    wrap(async ({ element_id, data }: { element_id: string; data: Record<string, unknown> }) => {
      const el = requireElement(element_id);
      await el.setData(data);
      return { ok: true };
    })
  );

  server.tool(
    'element_scroll_width',
    '获取元素可滚动宽度（scrollWidth）',
    { element_id: z.string() },
    wrap(async ({ element_id }: { element_id: string }) => {
      const el = requireElement(element_id);
      return { scroll_width: await el.scrollWidth() };
    })
  );

  server.tool(
    'element_scroll_height',
    '获取元素可滚动高度（scrollHeight）',
    { element_id: z.string() },
    wrap(async ({ element_id }: { element_id: string }) => {
      const el = requireElement(element_id);
      return { scroll_height: await el.scrollHeight() };
    })
  );

  server.tool(
    'element_scroll_to',
    '滚动 scroll-view 到指定位置',
    { element_id: z.string(), x: z.number(), y: z.number().describe('滚动位置（仅 scroll-view 可用）') },
    wrap(async ({ element_id, x, y }: { element_id: string; x: number; y: number }) => {
      const el = requireElement(element_id);
      await el.scrollTo(x, y);
      return { ok: true };
    })
  );

  server.tool(
    'element_swipe_to',
    '滑动 swiper 到指定滑块',
    { element_id: z.string(), index: z.number().describe('目标滑块 index（仅 swiper 可用）') },
    wrap(async ({ element_id, index }: { element_id: string; index: number }) => {
      const el = requireElement(element_id);
      await el.swipeTo(index);
      return { ok: true };
    })
  );

  server.tool(
    'element_move_to',
    '移动 movable-view 到指定位置',
    { element_id: z.string(), x: z.number(), y: z.number().describe('x/y 轴偏移（仅 movable-view 可用）') },
    wrap(async ({ element_id, x, y }: { element_id: string; x: number; y: number }) => {
      const el = requireElement(element_id);
      await el.moveTo(x, y);
      return { ok: true };
    })
  );

  server.tool(
    'element_slide_to',
    '设置 slider 组件的值',
    { element_id: z.string(), value: z.number().describe('要设置的值（仅 slider 可用）') },
    wrap(async ({ element_id, value }: { element_id: string; value: number }) => {
      const el = requireElement(element_id);
      await el.slideTo(value);
      return { ok: true };
    })
  );

  server.tool(
    'element_call_context_method',
    '调用 video 组件上下文 Context 方法',
    {
      element_id: z.string(),
      method: z.string().describe('上下文 Context 方法名，仅设置了 id 的 video 组件可用'),
      args: z.array(z.any()).optional().describe('方法参数'),
    },
    wrap(async ({ element_id, method, args }: { element_id: string; method: string; args?: unknown[] }) => {
      const el = requireElement(element_id);
      return { result: await el.callContextMethod(method, ...(args ?? [])) };
    })
  );

  server.tool(
    'element_touch',
    '触发元素触摸事件（touchstart / touchmove / touchend）',
    {
      element_id: z.string(),
      type: z.enum(['touchstart', 'touchmove', 'touchend']).describe('触摸事件类型'),
      touches: z.array(z.record(z.string(), z.any())).optional().describe('触摸点信息数组，如 [{identifier, pageX, pageY}]'),
      changedTouches: z.array(z.record(z.string(), z.any())).optional().describe('变化的触摸点信息数组'),
    },
    wrap(
      async ({ element_id, type, touches, changedTouches }: { element_id: string; type: 'touchstart' | 'touchmove' | 'touchend'; touches?: Array<Record<string, unknown>>; changedTouches?: Array<Record<string, unknown>> }) => {
        const el = requireElement(element_id);
        const options = { touches: touches ?? [], changedTouches: changedTouches ?? [] };
        await el[type](options);
        return { ok: true, message: `已触发 ${type}` };
      }
    )
  );
}

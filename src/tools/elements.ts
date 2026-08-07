import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrap } from '../wechat/utils.js';
import { registerElement, registerElements, requireElement } from '../wechat/session.js';

export function registerElementTools(server: McpServer): void {
  // ---------------- 元素级操作 ----------------
  server.registerTool(
    'element_query',
    {
      description: '在元素内按 WXSS 选择器查询首个匹配子元素',
      inputSchema: {
        element_id: z.string(),
        selector: z.string().describe('WXSS 选择器'),
      },
    },
    wrap(async ({ element_id, selector }: { element_id: string; selector: string }) => {
      const el = requireElement(element_id);
      const child = await el.$(selector);
      return child ? registerElement(child) : { element_id: null, message: '未找到匹配元素' };
    })
  );

  server.registerTool(
    'element_query_all',
    {
      description: '在元素内按 WXSS 选择器查询所有匹配子元素（返回 element_id 句柄数组；超 1000 个时仅末尾 1000 个句柄可用）',
      inputSchema: {
        element_id: z.string(),
        selector: z.string().describe('WXSS 选择器'),
      },
    },
    wrap(async ({ element_id, selector }: { element_id: string; selector: string }) => {
      const el = requireElement(element_id);
      const els = await el.$$(selector);
      return { count: els.length, elements: registerElements(els) };
    })
  );

  server.registerTool(
    'element_text',
    {
      description: '获取元素文本内容',
      inputSchema: {
        element_id: z.string(),
      },
    },
    wrap(async ({ element_id }: { element_id: string }) => {
      const el = requireElement(element_id);
      return { text: await el.text() };
    })
  );

  server.registerTool(
    'element_attribute',
    {
      description: '获取元素特性值（如 class / id / src）',
      inputSchema: {
        element_id: z.string(),
        name: z.string().describe('特性名，如 class / id / src'),
      },
    },
    wrap(async ({ element_id, name }: { element_id: string; name: string }) => {
      const el = requireElement(element_id);
      return { value: await el.attribute(name) };
    })
  );

  server.registerTool(
    'element_property',
    {
      description: '获取元素属性值（如 input 组件的 value）',
      inputSchema: {
        element_id: z.string(),
        name: z.string().describe('属性名，如 input 组件的 value'),
      },
    },
    wrap(async ({ element_id, name }: { element_id: string; name: string }) => {
      const el = requireElement(element_id);
      return { value: await el.property(name) };
    })
  );

  server.registerTool(
    'element_value',
    {
      description: '获取元素值（input/textarea 等表单组件）',
      inputSchema: {
        element_id: z.string(),
      },
    },
    wrap(async ({ element_id }: { element_id: string }) => {
      const el = requireElement(element_id);
      return { value: await el.value() };
    })
  );

  server.registerTool(
    'element_style',
    {
      description: '获取元素样式值（如 color / fontSize）',
      inputSchema: {
        element_id: z.string(),
        name: z.string().describe('样式名，如 color / fontSize'),
      },
    },
    wrap(async ({ element_id, name }: { element_id: string; name: string }) => {
      const el = requireElement(element_id);
      return { value: await el.style(name) };
    })
  );

  server.registerTool(
    'element_size',
    {
      description: '获取元素尺寸（宽高）',
      inputSchema: {
        element_id: z.string(),
      },
    },
    wrap(async ({ element_id }: { element_id: string }) => {
      const el = requireElement(element_id);
      return { size: await el.size() };
    })
  );

  server.registerTool(
    'element_offset',
    {
      description: '获取元素位置偏移（相对视口）',
      inputSchema: {
        element_id: z.string(),
      },
    },
    wrap(async ({ element_id }: { element_id: string }) => {
      const el = requireElement(element_id);
      return { offset: await el.offset() };
    })
  );

  server.registerTool(
    'element_tap',
    {
      description: '点击元素',
      inputSchema: {
        element_id: z.string(),
      },
    },
    wrap(async ({ element_id }: { element_id: string }) => {
      const el = requireElement(element_id);
      await el.tap();
      return { ok: true, message: '已点击元素' };
    })
  );

  server.registerTool(
    'element_longpress',
    {
      description: '长按元素',
      inputSchema: {
        element_id: z.string(),
      },
    },
    wrap(async ({ element_id }: { element_id: string }) => {
      const el = requireElement(element_id);
      await el.longpress();
      return { ok: true, message: '已长按元素' };
    })
  );

  server.registerTool(
    'element_input',
    {
      description: '向 input/textarea 组件输入文本',
      inputSchema: {
        element_id: z.string(),
        value: z.string().describe('需要输入的文本，仅 input/textarea 组件可用'),
      },
    },
    wrap(async ({ element_id, value }: { element_id: string; value: string }) => {
      const el = requireElement(element_id);
      await el.input(value);
      return { ok: true };
    })
  );

  server.registerTool(
    'element_trigger',
    {
      description: '触发元素事件（如 change / blur）',
      inputSchema: {
        element_id: z.string(),
        type: z.string().describe('触发事件类型，如 change / blur'),
        detail: z.record(z.string(), z.any()).optional().describe('触发事件时传递的 detail 值'),
      },
    },
    wrap(async ({ element_id, type, detail }: { element_id: string; type: string; detail?: Record<string, unknown> }) => {
      const el = requireElement(element_id);
      await el.trigger(type, detail);
      return { ok: true, message: `已触发事件 ${type}` };
    })
  );

  server.registerTool(
    'element_wxml',
    {
      description: '获取元素 WXML 结构（默认内部 WXML，includeSelf=true 返回包含自身的 outerWXML）',
      inputSchema: {
        element_id: z.string(),
        includeSelf: z.boolean().optional().describe('为 true 时返回包含元素自身的 outerWXML，默认仅返回内部 WXML'),
      },
    },
    wrap(async ({ element_id, includeSelf }: { element_id: string; includeSelf?: boolean }) => {
      const el = requireElement(element_id);
      return { wxml: includeSelf ? await el.outerWxml() : await el.wxml() };
    })
  );

  server.registerTool(
    'element_call_method',
    {
      description: '调用自定义组件实例方法',
      inputSchema: {
        element_id: z.string(),
        method: z.string().describe('需要调用的组件实例方法名，仅自定义组件可用'),
        args: z.array(z.any()).optional().describe('方法参数'),
      },
    },
    wrap(async ({ element_id, method, args }: { element_id: string; method: string; args?: unknown[] }) => {
      const el = requireElement(element_id);
      return { result: await el.callMethod(method, ...(args ?? [])) };
    })
  );

  server.registerTool(
    'element_data',
    {
      description: '获取自定义组件 data（可指定路径，仅自定义组件可用）',
      inputSchema: {
        element_id: z.string(),
        path: z.string().optional().describe('数据路径，仅自定义组件可用'),
      },
    },
    wrap(async ({ element_id, path }: { element_id: string; path?: string }) => {
      const el = requireElement(element_id);
      return { data: await el.data(path) };
    })
  );

  server.registerTool(
    'element_set_data',
    {
      description: '修改自定义组件 data（仅自定义组件可用）',
      inputSchema: {
        element_id: z.string(),
        data: z.record(z.string(), z.any()).describe('要改变的数据对象，仅自定义组件可用'),
      },
    },
    wrap(async ({ element_id, data }: { element_id: string; data: Record<string, unknown> }) => {
      const el = requireElement(element_id);
      await el.setData(data);
      return { ok: true };
    })
  );

  server.registerTool(
    'element_scroll_width',
    {
      description: '获取元素可滚动宽度（scrollWidth）',
      inputSchema: {
        element_id: z.string(),
      },
    },
    wrap(async ({ element_id }: { element_id: string }) => {
      const el = requireElement(element_id);
      return { scroll_width: await el.scrollWidth() };
    })
  );

  server.registerTool(
    'element_scroll_height',
    {
      description: '获取元素可滚动高度（scrollHeight）',
      inputSchema: {
        element_id: z.string(),
      },
    },
    wrap(async ({ element_id }: { element_id: string }) => {
      const el = requireElement(element_id);
      return { scroll_height: await el.scrollHeight() };
    })
  );

  server.registerTool(
    'element_scroll_to',
    {
      description: '滚动 scroll-view 到指定位置',
      inputSchema: {
        element_id: z.string(),
        x: z.number(),
        y: z.number().describe('滚动位置（仅 scroll-view 可用）'),
      },
    },
    wrap(async ({ element_id, x, y }: { element_id: string; x: number; y: number }) => {
      const el = requireElement(element_id);
      await el.scrollTo(x, y);
      return { ok: true };
    })
  );

  server.registerTool(
    'element_swipe_to',
    {
      description: '滑动 swiper 到指定滑块',
      inputSchema: {
        element_id: z.string(),
        index: z.number().describe('目标滑块 index（仅 swiper 可用）'),
      },
    },
    wrap(async ({ element_id, index }: { element_id: string; index: number }) => {
      const el = requireElement(element_id);
      await el.swipeTo(index);
      return { ok: true };
    })
  );

  server.registerTool(
    'element_move_to',
    {
      description: '移动 movable-view 到指定位置',
      inputSchema: {
        element_id: z.string(),
        x: z.number(),
        y: z.number().describe('x/y 轴偏移（仅 movable-view 可用）'),
      },
    },
    wrap(async ({ element_id, x, y }: { element_id: string; x: number; y: number }) => {
      const el = requireElement(element_id);
      await el.moveTo(x, y);
      return { ok: true };
    })
  );

  server.registerTool(
    'element_slide_to',
    {
      description: '设置 slider 组件的值',
      inputSchema: {
        element_id: z.string(),
        value: z.number().describe('要设置的值（仅 slider 可用）'),
      },
    },
    wrap(async ({ element_id, value }: { element_id: string; value: number }) => {
      const el = requireElement(element_id);
      await el.slideTo(value);
      return { ok: true };
    })
  );

  server.registerTool(
    'element_call_context_method',
    {
      description: '调用 video 组件上下文 Context 方法',
      inputSchema: {
        element_id: z.string(),
        method: z.string().describe('上下文 Context 方法名，仅设置了 id 的 video 组件可用'),
        args: z.array(z.any()).optional().describe('方法参数'),
      },
    },
    wrap(async ({ element_id, method, args }: { element_id: string; method: string; args?: unknown[] }) => {
      const el = requireElement(element_id);
      return { result: await el.callContextMethod(method, ...(args ?? [])) };
    })
  );

  server.registerTool(
    'element_touch',
    {
      description: '触发元素触摸事件（touchstart / touchmove / touchend；touches 必填且需至少一个触摸点，touchend 的结束触点也放入 touches）',
      inputSchema: {
        element_id: z.string(),
        type: z.enum(['touchstart', 'touchmove', 'touchend']).describe('触摸事件类型'),
        touches: z
          .array(z.record(z.string(), z.any()))
          .min(1)
          .describe('触摸点信息数组，必须提供至少一个触摸点，如 [{identifier, pageX, pageY}]'),
        changedTouches: z.array(z.record(z.string(), z.any())).optional().describe('变化的触摸点信息数组'),
      },
    },
    wrap(
      async ({ element_id, type, touches, changedTouches }: { element_id: string; type: 'touchstart' | 'touchmove' | 'touchend'; touches: Array<Record<string, unknown>>; changedTouches?: Array<Record<string, unknown>> }) => {
        const el = requireElement(element_id);
        const options = { touches, changedTouches: changedTouches ?? [] };
        await el[type](options);
        return { ok: true, message: `已触发 ${type}` };
      }
    )
  );
}

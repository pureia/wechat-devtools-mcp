/**
 * miniprogram-automator@0.12.1 的最小类型声明。
 *
 * SDK 自带的 out/*.d.ts 类型过于宽泛（大量 any、Promise<Page | undefined>），
 * 这里只声明本项目实际使用到的面；本文件中的 ambient 声明优先于 SDK 自带类型生效。
 */

declare module 'miniprogram-automator' {
  export interface ConnectOptions {
    wsEndpoint: string;
  }

  export interface Page {
    path: string;
    query?: Record<string, unknown>;
    $: (selector: string) => Promise<Element | null>;
    $$: (selector: string) => Promise<Element[]>;
    getElementByXpath: (selector: string) => Promise<Element | null>;
    getElementsByXpath: (selector: string) => Promise<Element[]>;
    waitFor: (condition: number | string) => Promise<void>;
    data: (path?: string) => Promise<unknown>;
    setData: (data: Record<string, unknown>) => Promise<void>;
    callMethod: (method: string, ...args: unknown[]) => Promise<unknown>;
    size: () => Promise<{ width: string; height: string }>;
    scrollTop: () => Promise<string | string[]>;
  }

  export interface Element {
    tagName: string;
    $: (selector: string) => Promise<Element | null>;
    $$: (selector: string) => Promise<Element[]>;
    text: () => Promise<string>;
    attribute: (name: string) => Promise<string>;
    property: (name: string) => Promise<string>;
    value: () => Promise<string>;
    style: (name: string) => Promise<string>;
    size: () => Promise<{ width: string; height: string }>;
    offset: () => Promise<{ left: number; top: number }>;
    tap: () => Promise<void>;
    longpress: () => Promise<void>;
    input: (value: string) => Promise<void>;
    trigger: (type: string, detail?: Record<string, unknown>) => Promise<void>;
    wxml: () => Promise<string>;
    outerWxml: () => Promise<string>;
    callMethod: (method: string, ...args: unknown[]) => Promise<unknown>;
    data: (path?: string) => Promise<unknown>;
    setData: (data: Record<string, unknown>) => Promise<void>;
    scrollWidth: () => Promise<number>;
    scrollHeight: () => Promise<number>;
    scrollTo: (x: number, y: number) => Promise<void>;
    swipeTo: (index: number) => Promise<void>;
    moveTo: (x: number, y: number) => Promise<void>;
    slideTo: (value: number) => Promise<void>;
    callContextMethod: (method: string, ...args: unknown[]) => Promise<unknown>;
    touchstart: (options: TouchOptions) => Promise<void>;
    touchmove: (options: TouchOptions) => Promise<void>;
    touchend: (options: TouchOptions) => Promise<void>;
  }

  export interface TouchOptions {
    touches: Array<Record<string, unknown>>;
    changedTouches: Array<Record<string, unknown>>;
  }

  export interface ConsoleMessage {
    type: string;
    args: unknown[];
  }

  export interface ExceptionMessage {
    message: string;
    stack: string;
  }

  export interface MiniProgram {
    currentPage: () => Promise<Page | undefined>;
    pageStack: () => Promise<Page[]>;
    navigateTo: (url: string) => Promise<Page | undefined>;
    redirectTo: (url: string) => Promise<Page | undefined>;
    navigateBack: () => Promise<Page | undefined>;
    reLaunch: (url: string) => Promise<Page | undefined>;
    switchTab: (url: string) => Promise<Page | undefined>;
    systemInfo: () => Promise<Record<string, unknown>>;
    callWxMethod: (method: string, ...args: unknown[]) => Promise<unknown>;
    mockWxMethod: (method: string, result: unknown) => Promise<void>;
    restoreWxMethod: (method: string) => Promise<void>;
    evaluate: (code: string, ...args: unknown[]) => Promise<unknown>;
    pageScrollTo: (scrollTop: number) => Promise<void>;
    // 传 path 保存文件时返回 undefined，不传返回图片 base64
    screenshot: (options?: { path?: string }) => Promise<string | undefined>;
    // 返回结构依赖 IDE 响应（可能为字符串或 {ticket: ...} 对象），暂不收紧类型，待真机验证
    getTicket: () => Promise<unknown>;
    setTicket: (ticket: string) => Promise<void>;
    refreshTicket: () => Promise<void>;
    disconnect: () => void;
    close: () => Promise<void>;
    on: {
      (event: 'console', listener: (msg: ConsoleMessage) => void): this;
      (event: 'exception', listener: (err: ExceptionMessage) => void): this;
    };
  }

  const automator: {
    connect: (options: ConnectOptions) => Promise<MiniProgram>;
  };

  export default automator;
}

/**
 * WXML 字符串的轻量解析器。
 *
 * 用途：把 SDK 的 Element.getWXML / outerWxml 返回的 WXML 字符串解析成内存树，
 * 作为页面结构树（page_tree）与文本搜索（page_query_by_text）的基础。
 * 只追求"能读"：跳过注释、支持自闭合标签、双/单引号与无引号属性值，
 * 不追求完整 XML 规范（运行时 WXML 通常格式良好，异常输入尽量容错）。
 */

export interface WxmlNode {
  tagName: string;
  attributes: Record<string, string>;
  /** 直接文本内容（节点自身的文本节点，已 trim） */
  text?: string;
  children: WxmlNode[];
}

export function parseWxml(input: string): WxmlNode | null {
  const stack: WxmlNode[] = [];
  let root: WxmlNode | null = null;
  let i = 0;
  const n = input.length;

  while (i < n) {
    const lt = input.indexOf('<', i);
    if (lt === -1) {
      appendText(stack, input.slice(i));
      break;
    }
    if (lt > i) {
      appendText(stack, input.slice(i, lt));
      i = lt;
      continue;
    }
    if (input.startsWith('<!--', i)) {
      const end = input.indexOf('-->', i + 4);
      i = end === -1 ? n : end + 3;
      continue;
    }
    if (input[i + 1] === '/') {
      const gt = input.indexOf('>', i);
      if (gt === -1) break;
      const name = input.slice(i + 2, gt).trim();
      const top = stack[stack.length - 1];
      if (top && top.tagName === name) stack.pop();
      i = gt + 1;
      continue;
    }
    const tag = parseTag(input, i);
    if (!tag) break;
    const node: WxmlNode = { tagName: tag.name, attributes: tag.attributes, children: [] };
    if (root === null) root = node;
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(node);
    if (!tag.selfClosing) stack.push(node);
    i = tag.next;
  }
  return root;
}

function appendText(stack: WxmlNode[], raw: string): void {
  const text = raw.trim();
  if (!text) return;
  const parent = stack[stack.length - 1];
  if (!parent) return;
  // 元素可能被子标签拆成多个文本块，拼接而非只留首个，避免文本查询漏匹配
  parent.text = parent.text === undefined ? text : `${parent.text} ${text}`;
}

interface ParsedTag {
  name: string;
  attributes: Record<string, string>;
  selfClosing: boolean;
  next: number;
}

function parseTag(input: string, start: number): ParsedTag | null {
  const n = input.length;
  let i = start + 1;
  while (i < n && /\s/.test(input.charAt(i))) i++;
  const nameStart = i;
  while (i < n && !/[\s/>]/.test(input.charAt(i))) i++;
  if (i >= n) return null;
  const name = input.slice(nameStart, i);
  const attributes: Record<string, string> = {};
  while (i < n) {
    while (i < n && /\s/.test(input.charAt(i))) i++;
    if (i >= n) break;
    const c = input[i];
    if (c === '>') {
      i++;
      break;
    }
    if (c === '/' && input[i + 1] === '>') {
      return { name, attributes, selfClosing: true, next: i + 2 };
    }
    const attrStart = i;
    while (i < n && !/[\s=/>]/.test(input.charAt(i))) i++;
    const attrName = input.slice(attrStart, i);
    while (i < n && /\s/.test(input.charAt(i))) i++;
    if (i < n && input[i] === '=') {
      i++;
      while (i < n && /\s/.test(input.charAt(i))) i++;
      if (i < n && (input[i] === '"' || input[i] === '\'')) {
        const quote = input[i];
        i++;
        const valueStart = i;
        while (i < n && input[i] !== quote) i++;
        attributes[attrName] = input.slice(valueStart, i);
        if (i < n) i++;
      }
      else {
        const valueStart = i;
        while (i < n && !/[\s/>]/.test(input.charAt(i))) i++;
        attributes[attrName] = input.slice(valueStart, i);
      }
    }
    else {
      // 孤立 `/` 等无法成名的字符：强制前进一格，避免属性循环死锁
      if (attrName === '') i++;
      attributes[attrName] = '';
    }
  }
  return { name, attributes, selfClosing: false, next: i };
}

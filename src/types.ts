/**
 * 跨模块共享类型。
 *
 * 句柄（handle）是本项目状态模型的核心：Page/Element 实例不直接暴露给
 * MCP 客户端，而是注册为 page_id / element_id 句柄，后续操作凭 id 从会话状态取回实例。
 */

/** 页面句柄：由 current_page / page_stack / 导航类工具注册并返回 */
export interface PageHandle {
  page_id: string;
  path: string;
  query: Record<string, unknown>;
}

/** 元素句柄：由 page_query / page_query_all / element_query 注册并返回 */
export interface ElementHandle {
  element_id: string;
  tagName: string;
}

/** 控制台日志条目（连接后自动收集，最多 500 条） */
export interface ConsoleLogEntry {
  time: string;
  type: string;
  args: unknown[];
}

/** 异常日志条目（连接后自动收集，最多 500 条） */
export interface ExceptionEntry {
  time: string;
  message: string;
  stack: string;
}

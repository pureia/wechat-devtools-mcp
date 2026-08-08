export const ERROR_CODES = {
  NOT_CONNECTED: '尚未连接小程序',
  INVALID_PAGE: 'page_id 无效或已失效',
  INVALID_ELEMENT: 'element_id 无效或已失效',
  CONNECTION_LOST: '小程序连接已断开',
  CLI_START_FAILED: '启动微信开发者工具失败',
  TIMEOUT: '操作超时',
  TICKET_DISABLED: '开发者工具未开放票据能力',
  PORT_OCCUPIED: '自动化端口被占用',
  INVALID_PROJECT: '项目路径无效',
  UNKNOWN: '未知错误',
} as const;

export class McpError extends Error {
  readonly code: string;
  readonly hint: string;

  constructor(code: string, message: string, hint = '') {
    super(message);
    this.name = 'McpError';
    this.code = code;
    this.hint = hint;
  }
}

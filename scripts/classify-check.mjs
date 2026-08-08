import { createJiti } from 'jiti';
import assert from 'node:assert/strict';

/**
 * classifyError / fail 错误分类核对：对正则回退链喂代表性消息，断言错误码与 hint。
 * 直接加载 TS 源码（jiti 运行时转译），不启动 MCP 服务器，无外部依赖。
 *
 * 运行: pnpm run test:classify（或 node scripts/classify-check.mjs）
 */
const jiti = createJiti(import.meta.url);
const { classifyError, fail } = await jiti.import('../src/wechat/utils.ts');

// 消息 → 期望错误码（覆盖新增规则与全部既有分类，防止误标/漏标回归）
const cases = [
  // 新增：SDK connectTool 连接失败（端口未开 / 项目窗口未打开）
  ['Failed connecting to ws://127.0.0.1:9420, check if target project window is opened with automation enabled', 'CONNECTION_LOST'],
  // 新增：launch / connect 重复连接守卫（两版消息）
  ['已存在连接，请先调用 close 或 disconnect 后再 launch', 'INVALID_STATE'],
  ['已存在连接，请先调用 close 或 disconnect 后再 connect', 'INVALID_STATE'],
  // 回归：既有分类
  ['尚未连接小程序', 'NOT_CONNECTED'],
  ['page_id 无效或已失效: page_1', 'INVALID_PAGE'],
  ['element_id 无效或已失效: el_1', 'INVALID_ELEMENT'],
  ['requireElement(...).scrollTo is not a function', 'INVALID_ELEMENT'],
  ['requireElement(...).input is not a function', 'INVALID_ELEMENT'],
  // 新增：元素类型不支持的其余操作（scrollWidth/scrollHeight 仅 scroll-view，data/setData 仅自定义组件）
  ['I(...).scrollWidth is not a function', 'INVALID_ELEMENT'],
  ['I(...).scrollHeight is not a function', 'INVALID_ELEMENT'],
  ['I(...).data is not a function', 'INVALID_ELEMENT'],
  ['I(...).setData is not a function', 'INVALID_ELEMENT'],
  // 新增：property/value 在无该属性的元素上（如普通 view 无 value）
  ['view.value not exists', 'INVALID_ELEMENT'],
  ['view.class not exists', 'INVALID_ELEMENT'],
  // 新增：开发者工具未开放票据能力
  ['ticket is not allow to get, navigate to security settings and turn it on', 'TICKET_DISABLED'],
  ['current login type is not allow to refresh ticket', 'TICKET_DISABLED'],
  // 回归：其余分类
  ['Connection closed, check if wechat web devTools is still running', 'CONNECTION_LOST'],
  ['启动微信开发者工具失败: 未找到微信开发者工具 cli', 'CLI_START_FAILED'],
  ['连接微信开发者工具超时(30000ms)', 'TIMEOUT'],
  ['未知错误消息', 'UNKNOWN'],
];

for (const [message, expected] of cases) {
  const { code, hint } = classifyError(message);
  assert.equal(code, expected, `消息「${message}」应归类为 ${expected}，实际 ${code}`);
  if (expected !== 'UNKNOWN') {
    assert.ok(hint, `消息「${message}」应附带 hint`);
  }
}

// fail() 直通：自带 code/hint 的错误不经正则（McpError 路径），且序列化结果包含 code/hint
const err = new Error('已存在连接，请先调用 close 或 disconnect 后再 launch');
err.code = 'INVALID_STATE';
err.hint = '先 close';
const result = fail(err);
const parsed = JSON.parse(result.content[0].text);
assert.equal(result.isError, true);
assert.equal(parsed.error_code, 'INVALID_STATE');
assert.equal(parsed.hint, '先 close');

console.info(`classify-check: ${cases.length} 条消息 + fail 直通断言通过`);

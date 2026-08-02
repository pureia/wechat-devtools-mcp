import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
/**
 * MCP 冒烟测试：通过 stdio 与服务器完成 MCP 握手，验证 initialize / tools/list / ping。
 *
 * 注意：SDK 1.x 的 stdio 传输使用 NDJSON（每行一个 JSON 消息），而非 Content-Length 帧。
 *
 * 运行: pnpm run smoke
 */
import { spawn } from 'node:child_process';

const serverPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'index.js');
const child = spawn(process.execPath, [serverPath], { stdio: ['pipe', 'pipe', 'inherit'] });

let buffer = '';
let nextId = 1;
const pending = new Map();

function send(msg) {
  child.stdin.write(`${JSON.stringify(msg)}\n`);
}

function request(method, params, timeoutMs = 10000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`请求 ${method} 超时(${timeoutMs}ms)`));
    }, timeoutMs);
    pending.set(id, {
      method,
      resolve: (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });
    send({ jsonrpc: '2.0', id, method, params });
  });
}

function onMessage(msg) {
  if (msg.id !== undefined && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(`${p.method} error: ${JSON.stringify(msg.error)}`));
    else p.resolve(msg.result);
  }
}

child.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  let idx;
  // eslint-disable-next-line no-cond-assign -- NDJSON 逐行读取的标准写法
  while ((idx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    try {
      onMessage(JSON.parse(line));
    }
    catch (err) {
      console.error('无法解析服务器输出行，已跳过:', line, err.message);
    }
  }
});

try {
  const initialize = await request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'smoke-test', version: '1.0.0' },
  });

  send({ jsonrpc: '2.0', method: 'notifications/initialized' });

  const tools = await request('tools/list', {});
  const ping = await request('ping', {});
  const callResult = await request('tools/call', { name: 'release_handles', arguments: { scope: 'all' } });
  const statusResult = await request('tools/call', { name: 'status', arguments: {} });

  const toolNames = (tools.tools ?? []).map((t) => t.name);
  console.info('=== 冒烟测试结果 ===');
  console.info('initialize:', 'OK', `(protocolVersion=${initialize.protocolVersion}, server=${initialize.serverInfo.name}@${initialize.serverInfo.version})`);
  console.info('ping:', 'OK');
  console.info(`tools/list: OK (共 ${toolNames.length} 个工具)`);
  console.info('tools/call(release_handles):', 'OK', JSON.stringify(callResult.content?.[0]?.text));
  console.info('tools/call(status,未连接):', 'OK', JSON.stringify(statusResult.content?.[0]?.text));

  const callText = callResult.content?.[0]?.text ?? '';
  const EXPECTED_TOOL_COUNT = 58;
  if (toolNames.length !== EXPECTED_TOOL_COUNT || ping === undefined || !callText.includes('句柄已清理')) {
    console.error(`FAIL: 工具数量不符（期望 ${EXPECTED_TOOL_COUNT}，实际 ${toolNames.length}）、ping 异常或 tools/call 调用失败`);
    process.exit(1);
  }
  console.info('SMOKE TEST PASSED');
}
catch (err) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
finally {
  child.kill();
}

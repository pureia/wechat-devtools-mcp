import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
/**
 * 真实流程验证：通过 MCP 协议驱动服务器，对微信开发者工具中的小程序做真实自动化。
 * 流程：launch/connect -> re_launch -> 页面元素查询 -> 元素操作 -> 截图 -> status -> close
 *
 * 需先配置环境变量（真实机器路径因人而异，不写入仓库）：
 *   WECHAT_PROJECT_PATH  小程序编译产物目录（uni-app: unpackage/dist/build/mp-weixin；原生: 含 project.config.json 的目录）
 *   WECHAT_CLI_PATH      微信开发者工具 cli 绝对路径（Windows 默认: C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat）
 *
 * 运行: node scripts/real-flow-test.mjs
 */
import { spawn } from 'node:child_process';

const projectPath = process.env.WECHAT_PROJECT_PATH;
const cliPath = process.env.WECHAT_CLI_PATH;
// 需要打开的应用内页面路径，按被测小程序实际路由修改
const RELAUNCH_URL = '/pages/main/views/bench/index';

if (!projectPath || !cliPath) {
  console.error('请先设置环境变量 WECHAT_PROJECT_PATH（编译产物目录）与 WECHAT_CLI_PATH（开发者工具 cli）');
  process.exit(1);
}

const serverPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'index.js');

const child = spawn(process.execPath, [serverPath], { stdio: ['pipe', 'pipe', 'inherit'] });
let buffer = '';
let nextId = 1;
const pending = new Map();

function send(msg) {
  child.stdin.write(`${JSON.stringify(msg)}\n`);
}

function request(method, params, timeoutMs = 60000) {
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
      console.error('[parse-error]', line.slice(0, 200), err.message);
    }
  }
});

/** 解析工具返回的文本内容 */
function text(result) {
  const t = result?.content?.[0]?.text ?? '';
  try {
    return JSON.parse(t);
  }
  catch {
    return t;
  }
}

const step = (name) => console.info(`\n=== ${name} ===`);

try {
  await request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'real-flow-test', version: '1.0.0' },
  });
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });

  step('launch 启动并连接开发者工具');
  const launchRes = await request('tools/call', {
    name: 'launch',
    arguments: { projectPath, cliPath, timeout: 90000, trustProject: true },
  }, 120000);
  console.info(text(launchRes));

  if (launchRes?.isError) {
    step('launch 失败，回退 connect 连接已有自动化端口 9420');
    const connectRes = await request('tools/call', {
      name: 'connect',
      arguments: { wsEndpoint: 'ws://127.0.0.1:9420' },
    });
    console.info(text(connectRes));
    if (connectRes?.isError) {
      throw new Error('launch 与 connect 均失败');
    }
  }

  step(`re_launch 到 ${RELAUNCH_URL}`);
  const relaunchRes = await request('tools/call', {
    name: 're_launch',
    arguments: { url: RELAUNCH_URL },
  });
  const relaunch = text(relaunchRes);
  console.info(relaunch);
  const pageId = relaunch.page_id;
  if (!pageId) throw new Error('未获取到 page_id');

  step('page_wait_for 等待页面渲染');
  console.info(text(await request('tools/call', {
    name: 'page_wait_for',
    arguments: { page_id: pageId, condition: 2000 },
  })));

  step('page_query 查询首个 view 元素');
  const qRes = await request('tools/call', {
    name: 'page_query',
    arguments: { page_id: pageId, selector: 'view' },
  });
  const q = text(qRes);
  console.info(q);

  step('page_data 获取页面渲染数据');
  const dRes = await request('tools/call', {
    name: 'page_data',
    arguments: { page_id: pageId },
  });
  const data = text(dRes);
  console.info('data keys:', Object.keys(data.data ?? {}));

  step('page_scroll_top 获取滚动位置');
  console.info(text(await request('tools/call', {
    name: 'page_scroll_top',
    arguments: { page_id: pageId },
  })));

  step('screenshot 截图保存');
  const shotPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'screenshot.png');
  console.info(text(await request('tools/call', {
    name: 'screenshot',
    arguments: { path: shotPath },
  })));
  const fs = await import('node:fs');
  const exists = fs.existsSync(shotPath);
  console.info('截图文件存在:', exists, exists ? `(${fs.statSync(shotPath).size} bytes)` : '');

  step('status 当前状态');
  console.info(text(await request('tools/call', { name: 'status', arguments: {} })));

  step('close 关闭连接');
  console.info(text(await request('tools/call', { name: 'close', arguments: {} })));

  console.info('\nREAL FLOW TEST PASSED');
}
catch (err) {
  console.error('\nFAIL:', err.message);
  process.exit(1);
}
finally {
  child.kill();
}

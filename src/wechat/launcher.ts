import type { MiniProgram } from 'miniprogram-automator';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { sleep } from './utils.js';
import { McpError } from './errors.js';
import { automator } from './automator.js';

export interface LaunchOptions {
  projectPath: string;
  cliPath?: string;
  timeout?: number;
  port?: number;
  account?: string;
  ticket?: string;
  trustProject?: boolean;
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.listen(port, '127.0.0.1', () => srv.close(() => resolve(true)));
  });
}

async function findFreePort(preferred = 9420): Promise<number> {
  for (let p = preferred; p < preferred + 20; p++) {
    if (await isPortFree(p)) return p;
  }
  throw new McpError('PORT_OCCUPIED', `端口 ${preferred}~${preferred + 19} 均被占用`, '请指定其他 port 参数');
}

function resolveCliPath(cliPath?: string): string {
  if (cliPath) return cliPath;
  const defaults = [
    'C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat',
    '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
  ];
  return defaults.find((p) => existsSync(p)) ?? '';
}

/**
 * 自动探测小程序项目路径（projectPath 缺省时使用）：
 * 优先检查当前工作区的 uni-app 编译产物，其次向上逐级查找含 project.config.json 的目录。
 */
export async function discoverProjectPath(): Promise<string | null> {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, 'unpackage/dist/build/mp-weixin'),
    path.join(cwd, 'unpackage/dist/dev/mp-weixin'),
    cwd,
  ];
  for (const dir of candidates) {
    if (existsSync(path.join(dir, 'project.config.json'))) return dir;
  }
  let dir = path.dirname(cwd);
  for (let i = 0; i < 4 && dir !== path.dirname(dir); i++) {
    if (existsSync(path.join(dir, 'project.config.json'))) return dir;
    dir = path.dirname(dir);
  }
  return null;
}

/**
 * 启动微信开发者工具并连接小程序。
 * 未直接使用 SDK 的 automator.launch：其内部 spawn 中文路径的 .bat 会抛 EINVAL，
 * 这里用 shell:true 重新实现，并绕开其 checkVersion 版本门禁。
 */
export async function launchMiniProgram(options: LaunchOptions): Promise<MiniProgram> {
  const { projectPath, cliPath, timeout = 30000, port, ticket, account, trustProject } = options;
  const resolvedCli = resolveCliPath(cliPath);
  if (!resolvedCli) {
    throw new McpError(
      'CLI_START_FAILED',
      '未找到微信开发者工具 cli',
      '请通过 cliPath 指定（Windows 默认: C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat）'
    );
  }
  const freePort = await findFreePort(port ?? 9420);

  const args = ['auto', '--project', projectPath, '--auto-port', String(freePort)];
  if (account) args.push('--auto-account', account);
  if (ticket) args.push('--ticket', ticket);
  if (trustProject) args.push('--trust-project');

  let spawnError: Error | null = null;
  let exited = false;
  try {
    // 中文路径的 .bat 直接 spawn 会 EINVAL；shell:true 则会把含空格路径拆坏（如默认安装路径）。
    // 故显式走 cmd.exe：cmd /s /c 会剥离首尾引号并保留内层引号，
    // windowsVerbatimArguments 让 Node 原样传参（不做二次转义），
    // 所有参数一律加引号，含空格路径即可安全传递。
    const quote = (s: string) => `"${s}"`;
    const cmdLine = `"${[resolvedCli, ...args].map(quote).join(' ')}"`;
    const child = spawn('cmd.exe', ['/d', '/s', '/c', cmdLine], {
      stdio: 'ignore',
      windowsVerbatimArguments: true,
    });
    child.on('error', (err) => {
      spawnError = err;
    });
    child.on('exit', (code) => {
      if (code && code !== 0) {
        spawnError = new Error(`cli 退出码 ${code}，请检查 cliPath 是否正确`);
      }
      setTimeout(() => {
        exited = true;
      }, 15000);
    });
  }
  catch (err) {
    spawnError = err instanceof Error ? err : new Error(String(err));
  }

  const deadline = Date.now() + timeout;
  let mp: MiniProgram | null = null;
  while (Date.now() < deadline) {
    if (spawnError) {
      throw new McpError('CLI_START_FAILED', `启动微信开发者工具失败: ${spawnError.message}`, '请检查 cliPath 是否正确');
    }
    try {
      mp = await automator.connect({ wsEndpoint: `ws://127.0.0.1:${freePort}` });
      break;
    }
    catch {
      if (exited) {
        throw new McpError(
          'CLI_START_FAILED',
          '启动微信开发者工具失败：cli 已退出但自动化端口未开启',
          '请确认开发者工具「设置->安全设置->服务端口」已开启'
        );
      }
      await sleep(1000);
    }
  }
  if (!mp) {
    throw new McpError('TIMEOUT', `连接微信开发者工具超时(${timeout}ms)`, '请确认 cliPath 正确且「服务端口」已开启');
  }
  return mp;
}

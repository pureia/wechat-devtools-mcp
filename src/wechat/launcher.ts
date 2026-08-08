import type { ChildProcess } from 'node:child_process';
import type { MiniProgram } from 'miniprogram-automator';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { sleep } from './utils.js';
import { McpError } from './errors.js';
import { cliOptions } from '../config.js';
import { automator } from './automator.js';
import { setWsEndpoint } from './session.js';

export interface LaunchOptions {
  projectPath: string;
  cliPath?: string;
  timeout?: number;
  port?: number;
  account?: string;
  ticket?: string;
  trustProject?: boolean;
}

// launch 实际占用的自动化端口：供 connect 无参缺省时对齐，
// 避免 launch 因端口被占而漂移后，connect 仍连原端口造成不一致。
// 初始值取命令行 --port（未 launch 前 connect 应连用户指定的端口）。
let lastUsedPort = cliOptions.port ?? 9420;

export function getLastUsedPort(): number {
  return lastUsedPort;
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
 * 未直接使用 SDK 的 automator.launch：其内部 spawn 中文路径的 .bat 会抛 EINVAL。
 * Windows 用 cmd.exe /s /c 包装规避该问题；macOS/Linux 直接 spawn 参数数组，
 * 与 SDK Launcher.launch 行为一致；并绕开其 checkVersion 版本门禁。
 */
export async function launchMiniProgram(options: LaunchOptions): Promise<MiniProgram> {
  const { projectPath, cliPath, timeout = 30000, port, ticket, account, trustProject } = options;
  const resolvedCli = resolveCliPath(cliPath);
  if (!resolvedCli) {
    throw new McpError(
      'CLI_START_FAILED',
      '未找到微信开发者工具 cli',
      '请通过 cliPath 指定（Windows 默认: C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat；macOS 默认: /Applications/wechatwebdevtools.app/Contents/MacOS/cli）'
    );
  }
  const freePort = await findFreePort(port ?? 9420);

  const args = ['auto', '--project', projectPath, '--auto-port', String(freePort)];
  if (account) args.push('--auto-account', account);
  if (ticket) args.push('--ticket', ticket);
  if (trustProject) args.push('--trust-project');

  let child: ChildProcess | null = null;
  let spawnError: Error | null = null;
  let exited = false;
  try {
    if (process.platform === 'win32') {
      // Windows 中文路径的 .bat 直接 spawn 会 EINVAL；shell:true 则会把含空格路径拆坏（如默认安装路径）。
      // 故显式走 cmd.exe：cmd /s /c 会剥离首尾引号并保留内层引号，
      // windowsVerbatimArguments 让 Node 原样传参（不做二次转义），
      // 所有参数一律加引号，含空格路径即可安全传递。
      const quote = (s: string) => `"${s}"`;
      const cmdLine = `"${[resolvedCli, ...args].map(quote).join(' ')}"`;
      child = spawn('cmd.exe', ['/d', '/s', '/c', cmdLine], {
        stdio: 'ignore',
        windowsVerbatimArguments: true,
      });
    }
    else {
      // macOS/Linux：cli 为 Unix 可执行文件，直接 spawn 参数数组即可，
      // 与 SDK 原生 Launcher.launch 行为一致，无需 shell 包装。
      child = spawn(resolvedCli, args, { stdio: 'ignore' });
    }
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

  try {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (spawnError) {
        throw new McpError('CLI_START_FAILED', `启动微信开发者工具失败: ${spawnError.message}`, '请检查 cliPath 是否正确');
      }
      try {
        const mp = await automator.connect({ wsEndpoint: `ws://127.0.0.1:${freePort}` });
        // 仅在连接成功后记录实际占用端口与地址，失败时不污染后续无参 connect 的缺省值
        lastUsedPort = freePort;
        setWsEndpoint(`ws://127.0.0.1:${freePort}`);
        return mp;
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
    throw new McpError('TIMEOUT', `连接微信开发者工具超时(${timeout}ms)`, '请确认 cliPath 正确且「服务端口」已开启');
  }
  catch (err) {
    // 失败（超时/启动失败）时尽力清理 cli 子进程，避免孤儿进程持续占用端口；
    // Windows 上 cmd.exe 只是包装进程，child.kill() 无法级联终止真正的 cli 进程树，
    // 故改用 taskkill /T /F 按进程树终止；成功路径已在上面 return，不会走到这里。
    if (child && !child.killed) {
      try {
        if (process.platform === 'win32' && child.pid) {
          spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }).on('error', () => {});
        }
        else {
          child.kill();
        }
      }
      catch {
        /* 进程已退出则忽略 */
      }
    }
    throw err;
  }
}

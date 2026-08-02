/**
 * 进程级命令行参数（MCP 客户端通过 args 传入），与 launch 工具参数对齐：
 * 作为 launch / connect 工具参数的默认值，工具参数传入时优先。
 * 例如：npx -y @purea/wechat-devtools-mcp@latest --projectPath=E:/proj/mp-weixin --cliPath=...
 */
import process from 'node:process';

export interface CliOptions {
  projectPath?: string;
  cliPath?: string;
  timeout?: number;
  port?: number;
  account?: string;
  ticket?: string;
  trustProject?: boolean;
}

export function parseCliOptions(argv: string[]): CliOptions {
  const opts: CliOptions = {};
  for (const arg of argv) {
    const eq = arg.indexOf('=');
    const key = eq === -1 ? arg : arg.slice(0, eq);
    const value = eq === -1 ? undefined : arg.slice(eq + 1);
    switch (key) {
      case '--projectPath':
        opts.projectPath = value;
        break;
      case '--cliPath':
        opts.cliPath = value;
        break;
      case '--timeout': {
        const timeout = Number(value);
        if (Number.isInteger(timeout) && timeout > 0) opts.timeout = timeout;
        break;
      }
      case '--port': {
        const port = Number(value);
        if (Number.isInteger(port) && port > 0 && port <= 65535) opts.port = port;
        break;
      }
      case '--account':
        opts.account = value;
        break;
      case '--ticket':
        opts.ticket = value;
        break;
      case '--trust-project':
        // flag 不带值时开启，显式 =false 时关闭
        opts.trustProject = value === undefined || value !== 'false';
        break;
      default:
        break;
    }
  }
  return opts;
}

export const cliOptions: CliOptions = parseCliOptions(process.argv.slice(2));

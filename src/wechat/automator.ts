import type { MiniProgram } from 'miniprogram-automator';
import { createRequire } from 'node:module';
import { PKG_NAME } from './version.js';

const require = createRequire(import.meta.url);

export const automator = require('miniprogram-automator') as {
  connect: (options: { wsEndpoint: string }) => Promise<MiniProgram>;
};

/**
 * 兼容新版微信开发者工具（>= 2.0）：Tool.getInfo 不再返回 SDKVersion 字段，
 * 老 SDK (0.12.1) 的 checkVersion 会因读取 undefined 崩溃（TypeError: split）。
 * 新版 IDE 基础库版本远高于 2.7.3，跳过该版本门禁是安全的。
 *
 * 补丁依赖 SDK 内部结构（out/MiniProgram.js 的 default 导出），一旦 SDK 升级改结构，
 * 补丁会静默失效并导致连接时崩溃；故未命中时打印告警，让问题可见而非带病运行。
 */
export function applyMiniProgramPatch(): void {
  const MiniProgramCtor = require('miniprogram-automator/out/MiniProgram.js');
  if (MiniProgramCtor?.default?.prototype?.checkVersion) {
    MiniProgramCtor.default.prototype.checkVersion = async function () {};
    return;
  }
  console.error(
    `[${PKG_NAME}] 警告: 未找到 miniprogram-automator 的 MiniProgram.prototype.checkVersion，版本兼容补丁未生效；` +
    '若在开发者工具 >= 2.0 上连接崩溃，请检查 SDK 结构是否变化'
  );
}

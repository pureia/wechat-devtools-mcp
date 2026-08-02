import type { MiniProgram } from 'miniprogram-automator';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export const automator = require('miniprogram-automator') as {
  connect: (options: { wsEndpoint: string }) => Promise<MiniProgram>;
};

/**
 * 兼容新版微信开发者工具（>= 2.0）：Tool.getInfo 不再返回 SDKVersion 字段，
 * 老 SDK (0.12.1) 的 checkVersion 会因读取 undefined 崩溃（TypeError: split）。
 * 新版 IDE 基础库版本远高于 2.7.3，跳过该版本门禁是安全的。
 */
export function applyMiniProgramPatch(): void {
  const MiniProgramCtor = require('miniprogram-automator/out/MiniProgram.js');
  if (MiniProgramCtor?.default?.prototype?.checkVersion) {
    MiniProgramCtor.default.prototype.checkVersion = async function () {};
  }
}

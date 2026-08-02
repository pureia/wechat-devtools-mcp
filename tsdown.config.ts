import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  platform: 'node',
  format: ['esm'],
  target: 'node20',
  // 全部依赖外置（含 miniprogram-automator 的 CJS 深路径 require 与运行时补丁），产物只打包本项目代码
  deps: {
    neverBundle: true,
  },
  // 本项目为 bin 工具，只需可执行入口：不生成 .d.ts 与 sourcemap
  dts: false,
  clean: true,
  outExtensions: () => ({ js: '.js' }),
});

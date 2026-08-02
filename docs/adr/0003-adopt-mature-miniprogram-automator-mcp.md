# 全量移植 miniprogram-automator-mcp 的成熟实现

## 背景

本仓库原为框架骨架：`src/tools/`、`src/wechat/`、`src/types.ts` 均为占位，仅打通了 MCP 服务器装配与 stdio 传输（见 ADR-0001、ADR-0002）。
同源项目 `@purea/wechat-devtools-mcp`（miniprogram-automator-mcp）已迭代到 v1.0.0，包含 58 个 MCP 工具与 launch/connect 全套基础设施。

## 决策

1. **全量移植**：移植 58 个工具（生命周期 6、小程序级 20、页面 7、元素 25）及基础设施（automator 版本补丁、errors、launcher、session、utils、version），能力与参考项目对齐。
2. **保持骨架目录结构**：保留 `src/mcp/server.ts` 装配层；基础层归入 `src/wechat/`（automator/session/launcher/errors/utils/version）；`src/tools/` 按能力域拆为 lifecycle / mini-program / pages / elements 四个文件，`tools/index.ts` 聚合注册。
3. **引入 zod**：MCP SDK 的 `server.tool()` 需要参数 schema，使用 zod 定义参数与描述，类型即文档。
4. **句柄模型与连接单例**：一个进程同一时刻维护一个 MiniProgram 连接；Page/Element 不直接暴露，而是注册为 `page_id` / `element_id` 句柄，后续操作凭 id 从会话状态取回实例。
5. **包名归入 @purea scope**：包名改为 `@purea/wechat-devtools-mcp`，版本号从 package.json 读取（version.ts），避免 server 内硬编码与 package.json 双源不一致。
6. **tsdown 外置全部依赖**：`deps.neverBundle` + `platform: node`。miniprogram-automator 是 CJS 深路径 require 且需运行时补丁（checkVersion），打包会破坏。

## 后果

- 能力与参考项目对齐，工具命名/参数/返回格式一致，后续可同构演进。
- 引入 zod 增加一个运行时依赖，换来 MCP 工具参数声明式校验。
- 一个连接的单例模型限制了并发连接（多项目并行）场景，当前无此需求，未来如需可重构为连接池。

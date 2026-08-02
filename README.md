# @purea/wechat-devtools-mcp

基于微信官方 [miniprogram-automator](https://www.npmjs.com/package/miniprogram-automator) SDK 封装的 MCP 服务器，
将微信小程序自动化能力暴露为 MCP 工具，供 AI 助手通过 stdio 调用，控制微信开发者工具中运行的小程序。

## 使用前提

1. 微信开发者工具开启「设置 -> 安全设置 -> 服务端口」（CLI/HTTP 调用）
2. 小程序已编译（uni-app 项目请先执行 `uni build`，`projectPath` 指向 `unpackage/dist/build/mp-weixin`；原生小程序指向含 `project.config.json` 的目录）

## 开发

```bash
pnpm install
pnpm typecheck   # 类型检查（tsc --noEmit）
pnpm build       # 构建（tsdown，输出 dist/index.js）
pnpm lint        # ESLint 检查
pnpm start       # 以 node 直接启动已构建的服务器
pnpm run smoke   # 冒烟测试：MCP 握手 + 工具列表 + 基本调用（基于 dist 产物）
```

## MCP 客户端配置示例

stdio 传输，以命令方式拉起。需先将本包放入 PATH（本地仓库可执行 `pnpm link --global`），或改用 `node <项目绝对路径>/dist/index.js`：

```json
{
  "mcpServers": {
    "@purea/wechat-devtools-mcp": {
      "command": "wechat-devtools-mcp"
    }
  }
}
```

## 提供的能力

- 连接 / 生命周期：`launch` / `connect` / `status` / `disconnect` / `close` / `release_handles`
- 小程序级操作：`page_stack` / `navigate_to` / `redirect_to` / `navigate_back` / `re_launch` / `switch_tab` / `current_page` / `system_info` / `evaluate` / `page_scroll_to` / `screenshot` / 票据（`get_ticket` / `set_ticket` / `refresh_ticket`）/ wx 方法（`call_wx_method` / `mock_wx_method` / `restore_wx_method`）
- 页面级操作：`page_query` / `page_query_all` / `page_wait_for` / `page_data` / `page_set_data` / `page_size` / `page_scroll_top`
- 元素级操作：`element_query` / `element_tap` / `element_input` / `element_text` / `element_trigger` 等 25 个
- 运行日志：`console_messages` / `exception_messages` / `clear_event_logs`

## 结构

```
src/
├── index.ts              # 入口：应用 automator 补丁、装配服务器并接入 stdio
├── mcp/server.ts         # MCP 服务器装配与工具注册
├── types.ts              # 共享类型
├── types/                # miniprogram-automator 补丁类型声明
├── tools/                # MCP 工具定义（按能力域拆分）
│   ├── lifecycle.ts      # launch/connect/status/disconnect/close/release_handles
│   ├── mini-program.ts   # 小程序级操作
│   ├── pages.ts          # 页面级操作
│   └── elements.ts       # 元素级操作
└── wechat/               # miniprogram-automator 封装层
    ├── automator.ts      # SDK 入口与 checkVersion 兼容补丁
    ├── errors.ts         # McpError 与错误码
    ├── launcher.ts       # cli 启动、端口探测、项目路径发现
    ├── session.ts        # 连接单例与 page/element 句柄状态
    ├── utils.ts          # ok/fail/wrap 与超时保护
    └── version.ts        # 包名与版本（读自 package.json）
```

## 发布

```bash
pnpm login          # 需拥有 @purea scope 的发布权限
pnpm publish
```

详见 [CONTEXT.md](./CONTEXT.md) 与 [docs/adr](./docs/adr/)。

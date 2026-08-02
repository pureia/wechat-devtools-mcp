# wechat-devtools-mcp

本地 MCP 服务器：将微信小程序自动化 SDK（[miniprogram-automator](https://www.npmjs.com/package/miniprogram-automator)）封装为 MCP 工具，供 MCP 客户端（LLM 应用）调用。

> 当前为项目框架骨架，`src` 具体工具内容待后续填充。

## 前置条件

- Node.js >= 20
- 微信开发者工具已安装并开启「设置 → 安全设置 → 服务端口」

## 开发

```bash
pnpm install
pnpm build       # tsdown 构建到 dist/
pnpm typecheck   # tsc --noEmit 类型检查
pnpm start       # 以 node 直接启动已构建的服务器
```

## MCP 客户端配置示例

stdio 传输，以命令方式拉起。需先将本包放入 PATH（本地仓库可执行 `pnpm link --global`），或改用 `node <项目绝对路径>/dist/index.js`：

```json
{
  "mcpServers": {
    "wechat-devtools-mcp": {
      "command": "wechat-devtools-mcp"
    }
  }
}
```

## 结构

```
src/
├── index.ts        # 入口：装配服务器并接入 stdio 传输
├── types.ts        # 共享类型（待填充）
├── mcp/server.ts   # MCP 服务器装配与工具注册
├── tools/          # MCP 工具定义（待填充）
└── wechat/         # miniprogram-automator 封装层（待填充）
```

详见 [CONTEXT.md](./CONTEXT.md) 与 [docs/adr](./docs/adr/)。

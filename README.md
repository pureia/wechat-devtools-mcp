# @purea/wechat-devtools-mcp

基于微信官方 [miniprogram-automator](https://www.npmjs.com/package/miniprogram-automator) SDK 封装的 MCP 服务器，
将微信小程序自动化能力暴露为 MCP 工具，供 AI 助手通过 stdio 调用，控制微信开发者工具中运行的小程序。

## 使用前提

1. 微信开发者工具开启「设置 -> 安全设置 -> 服务端口」（CLI/HTTP 调用）
2. 小程序已编译（uni-app 项目请先执行 `uni build`，`projectPath` 指向 `unpackage/dist/build/mp-weixin`；原生小程序指向含 `project.config.json` 的目录）

## MCP 客户端配置示例

已发布至 npmjs，直接通过 npx 拉起：

```json
{
  "mcpServers": {
    "Wechat Devtools Mcp": {
      "command": "npx",
      "args": ["-y", "@purea/wechat-devtools-mcp@latest"],
      "env": {},
      "disabled": false
    }
  }
}
```

可通过 `args` 追加默认参数，作为 `launch` / `connect` 工具参数的默认值（工具参数传入时优先）：

| 参数 | 说明 |
|---|---|
| `--projectPath=` | 小程序项目路径（缺省自动探测当前工作区） |
| `--cliPath=` | 微信开发者工具 CLI 路径（缺省自动探测默认安装位置） |
| `--timeout=` | 启动最长等待时间(ms)，默认 30000 |
| `--port=` | 自动化 WebSocket 端口 |
| `--account=` | 用户 openid（多账号调试） |
| `--ticket=` | 开发者工具登录票据 |
| `--trust-project` | 自动信任项目 |

```json
{
  "mcpServers": {
    "Wechat Devtools Mcp": {
      "command": "npx",
      "args": [
        "-y",
        "@purea/wechat-devtools-mcp@latest",
        "--projectPath=E:/MyProgram/demo/unpackage/dist/build/mp-weixin",
        "--cliPath=C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat",
        "--trust-project"
      ],
      "env": {},
      "disabled": false
    }
  }
}
```

## 提供的能力

- 连接 / 生命周期：`launch` / `connect` / `status` / `disconnect` / `close` / `release_handles`
- 小程序级操作：`page_stack` / `navigate_to` / `redirect_to` / `navigate_back` / `re_launch` / `switch_tab` / `current_page` / `system_info` / `evaluate` / `page_scroll_to` / `screenshot` / 票据（`get_ticket` / `set_ticket` / `refresh_ticket`）/ wx 方法（`call_wx_method` / `mock_wx_method` / `restore_wx_method`）
- 页面级操作：`page_query` / `page_query_all` / `page_query_xpath` / `page_query_xpath_all` / `page_call_method` / `page_wait_for` / `page_data` / `page_set_data` / `page_size` / `page_scroll_top`
- 元素级操作：`element_query` / `element_tap` / `element_input` / `element_text` / `element_trigger` 等 25 个
- 运行日志：`console_messages` / `exception_messages` / `clear_event_logs`

## 说明

- 句柄数量有上限（页面 500 / 元素 1000），超出后按 FIFO 淘汰最旧句柄；也可随时用 `release_handles` 手动清理。
- `status` 在连接失效时返回 `connected: false` 并附带原因，而不是直接报错。

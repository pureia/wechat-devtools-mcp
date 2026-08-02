# WeChat DevTools MCP

本项目的领域上下文：通过 MCP 协议，把微信开发者工具的小程序自动化能力暴露给 MCP 客户端（LLM 应用），由本地 MCP 服务器统一管理开发者工具连接生命周期与小程序操作。

## Language

**MCP 服务器（MCP Server）**:
通过标准输入输出（stdio）与 MCP 客户端通信的本地进程，是 LLM 与微信开发者工具之间的桥梁。
_Avoid_: 服务端、后台服务

**MCP 工具（Tool）**:
注册在 MCP 服务器上、可被 LLM 调用的具名能力单元，每个工具对应一次自动化操作（如打开页面、点击元素）。
_Avoid_: 接口、命令

**自动化（Automation）**:
使用 SDK 驱动微信开发者工具对小程序进行程序化操作的过程，与「编译上传」的 CI 场景相对。
_Avoid_: 测试、CI

**automator**:
miniprogram-automator 封装出的运行时入口对象，负责连接开发者工具并提供 Program / Page / Element 能力。
_Avoid_: 机器人、客户端

**小程序项目（Mini Program Project）**:
被自动化操作的对象，以本地目录形式存在于开发者工具中，包含 app.json 等配置。
_Avoid_: 应用、工程

**Program / Page / Element**:
automator 暴露的三层能力对象：Program 代表整个小程序运行态，Page 代表单个页面，Element 代表页面内的 UI 元素。
_Avoid_: 程序/页面/元素混用

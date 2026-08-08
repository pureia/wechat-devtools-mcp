# WeChat DevTools MCP

将微信开发者工具中运行的小程序自动化能力封装为 MCP 工具（stdio 传输）的服务器。
一个进程同一时刻维护一个小程序连接；页面与元素不直接暴露，而是通过"句柄"引用。

## Language

**连接 (connection)**:
进程与微信开发者工具自动化端口之间的 WebSocket 会话，由 launch 或 connect 建立。
_Avoid_: 会话、实例

**句柄 (handle)**:
对 Page 或 Element 实例的进程内引用，对外以 page_id / element_id 字符串暴露；后续操作凭 id 从会话状态取回实例。
_Avoid_: 引用、指针

**page_id**:
页面的句柄 id，形如 page_1；由 current_page / page_stack / 导航类工具注册并返回。
_Avoid_: pageId、页面 id

**element_id**:
元素的句柄 id，形如 el_1；由 page_query / page_query_all / element_query 注册并返回。
_Avoid_: elId、元素 id

**工具 (tool)**:
暴露给 MCP 客户端的调用面，按能力域命名：element_*（元素级）、page_*（页面级），其余为小程序级或生命周期级。
_Avoid_: 接口、命令

**会话状态 (session state)**:
进程内的连接、句柄 Map、递增序号与运行日志集合；disconnect / close 会整体重置。
_Avoid_: 全局变量、store

**MCP 服务器（MCP Server）**:
通过 stdio 与 MCP 客户端通信的本地进程，是 LLM 与微信开发者工具之间的桥梁。
_Avoid_: 服务端、后台服务

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

**结构树 (structure tree)**:
page_tree 返回的紧凑页面结构树：节点携带 tag / class / id / 文本摘要 / 节点路径 / 子节点数，叶子节点附屏幕坐标。
_Avoid_: 快照、accessibility tree

**节点路径 (node path)**:
从页面内容根起的 XPath 风格索引链（同标签兄弟间 1 基计数，不含 page 包裹节点），如 /view[2]/view[1]；可直接作为 XPath 传给 page_query_xpath。
_Avoid_: 面包屑、路径字符串

**文本查询 (text query)**:
按文本内容搜索页面元素的能力，由 page_query_by_text 提供（包含匹配、不区分大小写；WXML 快照命中为空时降级逐叶子 innerText 扫描）。
_Avoid_: 搜索、find

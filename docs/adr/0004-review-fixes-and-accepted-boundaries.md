# 2026-08 审查修复与接受的边界（grilling 结论）

## 背景

对 v0.0.2 做一次全面审查（静态分析 + typecheck/lint/smoke 验证 + 与 SDK 源码逐项核对），
发现若干问题点，经 grilling 逐项确认处理方式。本文记录修复项与明确接受的边界。

## 决策

### 修复项

1. **launch 失败时尽力清理 cli 子进程**：`launchMiniProgram` 超时或启动失败时清理
   `cmd.exe /c cli.bat auto` 派生的进程树——Windows 用 `taskkill /pid <pid> /T /F`
   级联终止，其余平台用 `child.kill()`。属尽力而为，降低孤儿进程持续占用自动化
   端口的概率。
2. **connect 默认端口与 launch 对齐**：launch **连接成功后**记录实际占用的自动化
   端口（`getLastUsedPort`，初始取 `--port ?? 9420`），connect 无参缺省一律使用
   该值，消除 launch 因端口被占漂移后 connect 仍连原端口的不一致；launch 失败时
   不更新该值，避免污染后续 connect 的缺省端口。
3. **launch 并发守卫前移**：`setConnecting(true)` 移到首个 await（项目路径探测）之前，
   关闭两个并发 launch 同时穿透守卫的窗口。
4. **版本补丁失败告警**：`applyMiniProgramPatch` 未命中
   `MiniProgram.prototype.checkVersion` 时打印告警而非静默失效，
   避免 SDK 升级改结构后在新版开发者工具上无日志崩溃。

### 接受的边界（不修复）

5. **截图大 payload**：`screenshot` 不传 path 仍返回 base64（保持现状），
   在工具描述中提示大图建议传 path 保存文件。
6. **安全面**：`evaluate` / `call_wx_method` / `mock_wx_method` 提供对小程序运行态的
   完全控制能力，`--ticket` 走明文 CLI 参数——stdio 本地进程模型下接受此边界
   （见 ADR-0002：远程/多客户端无需求）。
7. **错误归类**：`fail()` 对非 McpError 按中文字符串正则回退归类，英文错误消息
   可能落为 UNKNOWN——接受现状，不引入额外错误包装层。
   例外：元素 API 的 `xxx is not a function`（scrollTo/input/callContextMethod/
   callMethod/swipeTo/moveTo/slideTo）归类为 INVALID_ELEMENT 并提示元素类型不匹配。
8. **发布状态**：包已发布至 npmjs，README 中 `@latest` 表述准确，无需改动。
9. **工具超时**：除 launch / safeCurrentPage / page_wait_for 外，元素与页面操作
   不设统一超时——连接关闭时 SDK 立即 reject，"无响应但未关闭"属极罕见异常，
   status 工具可探测连接健康度；不引入统一超时层。
10. **`$` 吞选择器错误**：SDK 的 `$` 对非法选择器同样返回 null，工具层无法区分
    "元素不存在"与"选择器写错"，一律返回"未找到匹配元素"——接受现状，
    两者对 LLM 的后续动作一致（更换选择器重试），不改查询契约。

## 后果

- launch 失败后可立即重试，残留端口占用进程的概率降低（Windows 进程树级联清理）；
  失败时 `lastUsedPort` 不更新，无参 connect 仍指向上一次成功连接的端口
  （未 launch 过则为 `--port ?? 9420`）。
- 并发 launch 请求在同一进程内串行化，仍保持"一进程一连接"的单例模型。
- 补丁失效从"静默崩溃"变为"告警 + 崩溃"，失败可见、可定位。

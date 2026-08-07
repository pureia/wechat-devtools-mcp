# 2026-08 二次审查：延迟项与轻量修复（grilling 结论）

## 背景

对 v0.0.2（含未提交的 ADR-0004 修复）做二次全面审查：静态通读 + `pnpm build` / `typecheck` / `lint` / `smoke` 全绿 + 逐行核对
`miniprogram-automator@0.12.1` 源码与类型声明。发现若干疑点，经 grilling 逐项确认。本文记录本次审查的轻量修复、
明确接受的边界，以及一项待真机验证的悬置项。

## 已核实的既有行为（非问题，防止回归误判）

- **版本读取**：`version.ts` 运行时 `createRequire(import.meta.url)("../package.json")` 未被 tsdown 内联，
  但 npm 安装后 package.json 恒在包根（`files: ["dist"]` 不影响），`dist/index.js → ../package.json` 可解析；
  smoke 实测 `serverInfo = @purea/wechat-devtools-mcp@0.0.2`。
- **`disconnect()` 为同步**（SDK `MiniProgram.disconnect` → `connection.dispose()`），`disconnect` 工具与
  index.ts 退出清理中的非 await 调用是安全的。
- **`close()` 语义**：SDK 内部 `App.exit` + 1s 等待 + `Tool.close` + `disconnect`，会真实关闭项目窗口，与工具描述一致。
- **导航类工具固定 ~3s 延迟**：SDK `changeRoute` 内部 `sleep(3000)`，属 SDK 行为，非本仓库缺陷。
- **版本兼容补丁**：`checkVersion` 读取 `Tool.getInfo().SDKVersion` 在 IDE ≥ 2.0 无该字段时会崩，
  补丁目标 `out/MiniProgram.js` 的 `default.prototype.checkVersion` 与 SDK 结构一致，未命中告警逻辑有效。

## 决策

### 修复项（已实现）

1. **`fail()` 错误归类补 `data` / `setData`**：`element_data` / `element_set_data` 在非自定义组件元素上
   抛 `el.data is not a function` / `el.setData is not a function`，此前不命中正则落为 UNKNOWN；
   现与 ADR-0004 #7 例外列表对齐，追加两方法名，归类为 INVALID_ELEMENT。
   经 code-review 复核：无现实误报路径（Page 恒有 data/setData；`getData is not a function` 前无点号不匹配）。
2. **ambient d.ts 返回类型修正**：`Page.size` / `Element.size` 改为 `Promise<{ width: string; height: string }>`，
   `Page.scrollTop` 改为 `Promise<string | string[]>`，与 SDK 实际运行时（offsetWidth/offsetHeight 为字符串）
   及官方 0.12.1 类型一致。工具层直通 JSON 序列化、无数值运算，纯类型对齐，零行为变化。

### 接受的边界（不修复）

3. **导航后旧句柄不失效**：被销毁页面的 Page/Element 实例仍留在句柄 Map 中（FIFO 只管增长不管失效），
   对失效句柄调用报错后由 LLM 重新查询。不引入失效追踪，与 ADR-0004 #9/#10 精神一致。
4. **`evaluate` / `page_call_method` 中用户代码抛出的 `X.data is not a function` 可能被启发式误标为
   INVALID_ELEMENT**：与既有 callMethod/input 同类取舍，仅影响降级标注，不构成功能问题。

### 悬置项（待真机验证）

5. ~~**`element_touch` 触点字段名**~~ **已解决（2026-08-07 真机验证）**：实机验证结论——
   工具传 `changedTouches` **正确**，SDK 0.12.1 类型声明 `ITouchEventOptions.changeTouches` 是 SDK 的 typo。
   证据链：
   - 微信官方自动化文档（Element API）touch 事件参数表为 `touches` + `changedTouches`（均必填）；
   - 微信官方小程序事件文档使用 `changedTouches`；
   - 本地开发者工具（Stable v2.01.2510290）全部代码中 `changeTouches` 出现 0 次，运行时 TouchEvent 定义用 `changedTouches`；
   - 实机调用 `element_touch`（touchstart，携带 `changedTouches`）被 IDE 正常接受，无协议错误、无异常日志。
   无需修改本仓库代码（工具参数、payload 与 `TouchOptions` 类型均为 `changedTouches`，保持一致）。
6. **`offset()` / `scrollWidth()` / `scrollHeight()` 返回类型**：d.ts 按 number 收紧，SDK 类型为 `any`，
   与本次 size 修正同源，可能存在同类字符串偏差。真机验证后视结果决定是否同步修正。

## 后果

- `element_data` / `element_set_data` 的失败提示从「未知错误」变为可操作的 INVALID_ELEMENT。
- 类型声明与 SDK 运行时一致，杜绝 d.ts "撒谎"误导后续开发。
- 悬置项在真机验证前保持现状，避免基于猜测改动。

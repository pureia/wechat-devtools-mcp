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

1. **ambient d.ts 返回类型修正**：`Page.size` / `Element.size` 改为 `Promise<{ width: string; height: string }>`，
   `Page.scrollTop` 改为 `Promise<string | string[]>`，与 SDK 实际运行时（offsetWidth/offsetHeight 为字符串）
   及官方 0.12.1 类型一致。工具层直通 JSON 序列化、无数值运算，纯类型对齐，零行为变化。

### 未采用的候选修复（发布 v0.0.3 前回退）

2. **`fail()` 错误归类补 `data` / `setData`**：grilling 曾确认补齐该两项方法名（归类 INVALID_ELEMENT），
   但发布前依据代码审查意见回退，`element_data` / `element_set_data` 在非自定义组件元素上仍落 UNKNOWN。
   审查意见（minor，另一会话）：`data` / `setData` 是 element/page 通用方法名，补齐可能把
   **非元素类型错误的 SDK 内部异常**误归为 INVALID_ELEMENT（如 `evaluate` / `page_call_method`
   用户代码或 SDK 内部抛出的 `X.data is not a function`）。验证结论：1/2 验证者通过，另一验证者
   判为可接受回退 → 最终回退，保持 UNKNOWN 现状，避免扩大启发式误标面。
   本仓库代码（v0.0.3 发布内容）不含该正则项，此条与代码一致。

### 回退项实机验证（2026-08-07）

对回退后的实际行为做实机验证（v0.0.3 发布内容 = 本地构建，开发者工具 Stable v2.01.2510290，
bench 页普通 `view` 元素，非自定义组件）：

| 调用 | 返回 |
|---|---|
| `element_data`（普通 view） | `error_code: UNKNOWN`，message: `requireElement(...).data is not a function`，hint 空 |
| `element_set_data`（普通 view） | `error_code: UNKNOWN`，message: `requireElement(...).setData is not a function`，hint 空 |

**结论：回退可接受，无功能性 bug。**
- 错误正常以 `isError` 返回，message 自解释（`.data is not a function` 直接点明"元素不支持该操作"），
  LLM 可据此更换目标元素；代价仅为 error_code 不精细（UNKNOWN 而非 INVALID_ELEMENT）+ hint 为空。
- 顺带证实：错误 message 格式为 `requireElement(...).data is not a function`，`\.data is not a function`
  子串可被原正则命中——即若加回 `data|setData`，对普通 view 的归类为**正确**的 INVALID_ELEMENT；
  误标风险仅存在于 `evaluate` / `page_call_method` 用户代码抛同名错误的场景。两个方向均成立，
  回退取"宁可不精细、不误标"，与审查 minor 判断一致。

**可选改进方案（未实施）**：若后续想兼顾提示友好又不扩大正则误标面——
不改正则方法名列表，仅对"message 匹配 `is not a function` 且 error_code 仍为 UNKNOWN"的场合
补一条通用 hint（如"目标元素不支持该方法，请核对元素类型"）。该方案不引入 `data`/`setData`
的误标风险，可在未来版本按需实施。

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

- 类型声明与 SDK 运行时一致，杜绝 d.ts "撒谎"误导后续开发。
- `element_data` / `element_set_data` 的非自定义组件失败提示保持 UNKNOWN（候选修复未采用，
  2026-08-07 实机验证可接受，见"回退项实机验证"）。
- 悬置项在真机验证前保持现状，避免基于猜测改动。

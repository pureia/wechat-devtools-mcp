# 2026-08 WXML 服务端解析作为结构树与文本搜索的基础

## 背景

复杂页面上定位目标元素困难：现有 `page_query` / `page_query_xpath` 只接受选择器/XPath，
拿到句柄后还需逐个 `element_wxml` / `element_text` 拼信息，没有"页面结构概览 → 精准命中"的路径。

经 grilling 确认的优化目标（新增工具，不动现有查询契约，面向 LLM 消费）：

- `page_tree`：一次调用返回紧凑结构树，叶子附屏幕坐标，支持 `path` 下钻；
- `page_query_by_text`：按文本搜索元素，返回可操作句柄；
- `element_info`：聚合文本/属性/偏移/尺寸/WXML 摘要，减少往返。

## SDK 能力边界（事实）

- `miniProgram.evaluate` 运行在**逻辑层**（App.callFunction），无视图层 DOM 访问，
  无法借此读取渲染树。
- 元素查询只能走 IDE 协议：`Element.getElements`（选择器）、`getElementByXpath`、
  `Element.getWXML`（inner/outer）。SDK 无"祖先/索引路径/按文本搜索/无障碍树"能力。
- `outerWxml()` 可拿到任意元素的 WXML 字符串——服务端解析是可行的扩展点。

## 决策

1. **服务端解析 WXML**：新增 `src/wechat/wxml.ts` 轻量解析器，把页面根节点
   （`page.$('page')`，回退 `getElementByXpath('/page')`）的 `outerWxml()`
   解析成内存树，作为 `page_tree` / `page_query_by_text` 的共同基础。
   取舍：服务端解析 vs IDE 侧原生支持（不存在）vs evaluate（逻辑层无 DOM）——
   服务端解析是唯一可控且不依赖 IDE 新能力的路径。
2. **节点路径即 XPath**：路径采用 XPath 风格、同标签兄弟间 1 基计数
   （如 `/view[2]/button[1]`），**不含 page 包裹节点**，可直接复制给
   `page_query_xpath` 使用。实机验证发现 IDE XPath 无法按名选择根包裹节点
   （`/page` 与 `//page` 均不命中），因此路径从页面内容根（page 的第一个子节点）起算。
3. **`page_tree` 叶子默认附坐标**：每个叶子一次 `getElementByXpath` + `offset()` RPC，
   复杂页会变慢，提供 `include_offset=false` 关闭；`depth` / `max_nodes` 兜底防爆上下文，
   截断时返回 `truncated` 标记并建议用 `path` 下钻。
4. **`page_query_by_text` 自动取句柄**：解析树匹配文本 → 生成节点路径 →
   `getElementByXpath` 注册真句柄；XPath 解析失败时回退为仅返回元数据
   （`element_id: null`），不因单项失败中断整体结果。

## 接受的边界（推迟）

- **元素内文本搜索**（`element_query_by_text`）：第一版只做页面级。
- **可视化定位**（截图 + 框选目标元素）：需要新增图像处理依赖（如 sharp），
  收益与成本不匹配，推迟。

## 后果

- 复杂页定位链路从"反复枚举+比对"变为"结构树/文本搜索一步到位"，句柄污染可控
  （`page_tree` 不注册句柄，路径即定位符）。
- 解析器只追求"能读"（跳过注释、支持自闭合、引号与无引号属性），不追求完整 XML 规范；
  WXML 语义（wx:if 等）由 IDE 侧已渲染树保证，解析层不做求值。

## 实机验证结论（2026-08-08，jjb-training-app-manager 真机 + 开发者工具）

- `page.$('page')` 根选择器 **可用**（page_tree 根节点命中）；
- XPath 索引基准 **1 基、同标签兄弟计数**，与本实现路径生成一致（多叶子 text/offset 与解析树比对全部一致）；
- IDE XPath **不支持按名选择根包裹节点**：`/page`、`//page` 均不命中；去掉首段后的 `/view[1]/view[2]/...` 与 `//view[1]/view[2]/...` 均可精确解析 → 路径不含 page 包裹节点；
- `getWXML` 返回的**插值（{{}}）绑定文本节点为空**：同一节点 `element_text`（innerText）有完整值（如"永川高新技术产业开发区管理委员会"、"待审核"、"通知"），而 `element_wxml` 中对应 `<text>` 为空。这是 IDE 快照的固有限制（非偶发，页面完整渲染时仍如此）→ 文本检索不能只依赖 WXML 文本节点；
- `$$('*')` 未验证（本实现未依赖，留作后续优化面）。

## 文本抓取缺陷与修复决策（2026-08-08）

- **缺陷**：`page_tree` 的 text 字段与 `page_query_by_text` 的 WXML 匹配均依赖 `getWXML` 文本节点，会漏掉插值绑定的文本（页面完整渲染、innerText 有值的情况下 WXML 文本仍为空）。系统验证：118 个叶子中 WXML 文本仅 2 个，innerText 逐叶子扫描恢复 61 个非空文本（含全部关键内容）。
- **决策（方案 C，务实）**：`page_query_by_text` 先按 WXML 文本匹配；结果为空时降级为逐叶子 `element_text`（innerText）扫描（上限 400 叶子，防复杂页 RPC 爆炸），返回 `fallback_used` 标记。`page_tree` 保持 WXML 文本并在工具描述中标注"插值文本可能为空，按文本检索用 page_query_by_text"。
- **代价**：降级路径在复杂页可能较慢（每叶子 1 次 XPath 解析 + 1 次 innerText）；WXML 匹配非空但漏匹配的情况（如搜"永"只命中 logo、漏"永川…"）仍存在，属接受的边界。
- 未采用：方案 A（page_tree 全量 innerText，复杂页 N 次 RPC 拖慢树）与方案 B（只标注不修复）。

### 性能边界（2026-08-08 实机测量）

- 顺序扫描（`maxScan=400` 上限）：单次降级查询最坏 ~800 RPC，本地 IDE 实测约 **1.5s 内**；典型页（≤200 叶子）0.5~0.8s。命中即提前退出（凑满 `limit` 个匹配），常见关键词更快。
- 实测样本：bench 页 118 叶子无命中 ~0.4s；邀请记录页 345 叶子无命中 ~1.15s（3 次 1149~1235ms）。
- 超过 400 叶子的大页结果可能部分覆盖（仅扫描前 400 叶子，已文档化）；无死循环、无内存风险、递归深度无风险（树无环、深度通常 <20）。
- 已知权衡：无命中查询在复杂页每次 ~1.2s 且无缓存（LLM 连续多次搜索会重复付出）。维持现状（简单、有界、可预测）；可选优化（降 maxScan / 小批量并行 / 按页缓存 innerText）留待有实际性能诉求时再评估。

## 待真机验证（遗留）

- 其他版本开发者工具 / 不同项目结构（如根首元素非 view）下的路径语义一致性。

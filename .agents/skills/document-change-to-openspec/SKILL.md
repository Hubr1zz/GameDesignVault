---
name: document-change-to-openspec
description: 当 GameDesignVault 的 `设计文档/` 正式设计内容发生修改并启用自动同步，或用户明确要求手动导入指定正式文档时，把正式设计内容拆解为导入报告中的 Spec 提案，供导入报告面板审阅；不得创建 OpenSpec change、delta spec 或正式 Spec。
---

# Document Change to OpenSpec

这是可选中间层。控制文件未启用时不得生成导入报告。自动同步只负责产生报告，不进入 OpenSpec 生命周期。

## 名词边界

- **导入报告**：正式设计文档差异的结构化摘要，显示在导入报告面板。
- **Spec 提案**：导入报告中的候选需求拆解；不是 `openspec/specs/` 下的正式 Spec，也不是 change 中的 delta spec。
- **draft change**：用户在导入报告面板对具体 Spec 提案点击“加入changes”后，由面板创建的 open change。
- **正式 Spec**：用户在对话中明确要求归档 open change 后，才由归档流程生成或更新的 Spec。

## 执行

1. 只允许以下两种触发：
   - 自动导入：本轮任务可能修改或已经修改 `设计文档/` 内正式设计内容。
   - 手动导入：用户明确要求把指定的 `设计文档/` 正式文档生成导入报告；即使本轮没有编辑也可触发。
   - 纯问答、普通只读检索、记录灵感、记录问题、术语词典维护、内容设计案例维护、Obsidian 配置、Agent 工作流/skill 规则更新、待办清单或修改历史维护，不触发本 skill。
2. 读取 `.agent-bridge/project-sync.json`，确认 `enabled=true`、`mode=proposal-only`。
3. 确定导入范围：
   - 先运行 `.agents/skills/document-change-to-openspec/scripts/check_formal_design_hashes.py`，传入 `.agent-bridge/design-hash-baseline.json` 与 `projectRoot`；以 `.agent-bridge/design-hash-report.json` 的 `changed` / `added` / `removed` 作为文件级变更判定，不逐页读取未变化的正式文档。
   - 同时读取 `.agent-bridge/implementation-sync-report.json`；项目 Change 的 `implementationStatus`、代码证据哈希和 `specSyncStatus` 由代码计算，Agent 只在状态异常或需要理解行为语义时读取对应代码/Spec。
   - 自动导入：检测本轮 Agent 实际修改且路径位于 `设计文档/` 的文件；Git 可用时检查 `lastProcessedRevision..HEAD` 与当前 `git status --short`。首次启用在任务开始记录当前 revision，不把启用前旧改动自动导入。
   - 手动导入：只读取用户明确指定的 `设计文档/` 正式文档，不要求这些文件在本轮产生差异。
   - `设计文档/` 之外的文件不得进入导入候选；`设计文档/` 内纯格式整理、链接修复或无行为变化的文字调整也不产生 Spec 提案。
4. 把有行为变化的正式文档差异按功能拆解为一个或多个 Spec 提案；纯格式、链接或措辞整理不产生提案。
5. 在 `.agent-bridge/outbox/<report-id>.json` 创建导入报告，至少记录：
   - `importType`：自动触发时写 `自动导入`，用户明确发起导入时写 `手动导入`。
   - 来源正式文档、差异摘要、创建时间和文件指纹。
   - Spec 提案列表：稳定提案 ID、标题、capability 建议、需求摘要、场景摘要、来源引用、未定 gap、采用状态。
6. 自动同步不得读取或写入目标项目的 `openspec/changes/`、`openspec/specs/`，不得运行任何 `openspec` 命令，也不得调用 OpenSpec proposal/update/apply/sync/archive skill。
7. 未确定设计只写入提案的 gap/依赖，不擅自补齐。
8. 同一文件指纹不重复生成报告；同一轮正式文档变更尽量合并为一份导入报告。
   - 文件指纹由检查器计算；Agent 不以逐页阅读代替哈希判定。
9. 更新控制文件的 `status`、`pendingReport`、`lastEvent`、`lastProcessedAt`、`lastProcessedRevision`、`updatedAt`。
10. 报告导入报告路径和 Spec 提案数量，等待用户在导入报告面板处理。

## 后续权限边界

- “加入changes”：只能由用户在导入报告面板点击具体 Spec 提案后触发；每次采用生成或更新对应的 draft change。
- 自动同步 Agent 不得代替该点击，不得因为 `mode=proposal-only` 而创建完整 OpenSpec change artifacts。
- 归档：只有用户在对话中明确要求归档某个 open change 时才允许执行；归档是唯一可生成或更新正式 Spec 的路径。
- `proposal-only` 的含义仅是“生成导入报告中的 Spec 提案”，不等同于运行 `openspec-propose`。

字段见 [bridge-schema.md](references/bridge-schema.md)。

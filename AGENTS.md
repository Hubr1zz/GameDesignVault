---
type: Note
---
# GameDesignVault Agent 入口

处理本仓库文档前，读取并遵守 `Agent维护/SKILL.md` 
需要了解文档结构时读 `Agent维护/workspace-map.md`

本仓库是独立文档维护层，不依赖游戏代码项目。

仅当任务可能修改或已经修改 `设计文档/` 内正式设计内容，或用户明确要求手动导入指定正式文档时，才检查 `.agent-bridge/project-sync.json`：

- 不存在或 `enabled=false`：结束，不读取项目层。
- 已启用：显式读取 `.agents/skills/document-change-to-openspec/SKILL.md`。自动导入在开始时建立变更基线、结束时检测正式文档修改；手动导入只处理用户指定的正式文档。两者都只生成导入报告及其中的 Spec 提案，不创建 OpenSpec change、delta spec 或正式 Spec。

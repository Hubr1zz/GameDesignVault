# Bridge Schema

`.agent-bridge/project-sync.json`：

```json
{
  "schemaVersion": 2,
  "enabled": false,
  "mode": "proposal-only",
  "projectRoot": "",
  "status": "disabled",
  "pendingReport": "",
  "lastEvent": "",
  "enabledAt": "",
  "lastProcessedAt": "",
  "lastProcessedRevision": "",
  "lastError": "",
  "updatedBy": "",
  "updatedAt": ""
}
```

状态只使用 `disabled`、`idle`、`report-pending`、`error`。

兼容旧配置时可读取 `pendingChange`，但自动同步不得再向该字段写入 change ID；首次成功生成导入报告后迁移为 `pendingReport`。

`.agent-bridge/outbox/<report-id>.json`：

```json
{
  "schemaVersion": 1,
  "reportId": "import-YYYYMMDD-HHMMSS",
  "importType": "自动导入",
  "status": "待审阅",
  "createdAt": "",
  "sourceRevision": "",
  "sourceDocuments": [],
  "summary": "",
  "fileFingerprints": {},
  "specProposals": [
    {
      "proposalId": "stable-proposal-id",
      "title": "",
      "capability": "",
      "requirementSummary": "",
      "scenarioSummaries": [],
      "sourceRefs": [],
      "gaps": [],
      "adoptionStatus": "未采用",
      "draftChangeId": ""
    }
  ]
}
```

`importType` 只使用 `自动导入`、`手动导入`。`adoptionStatus` 只使用 `未采用`、`已加入changes`、`已忽略`。只有导入报告面板的“加入changes”操作可以填写 `draftChangeId` 并把状态改为 `已加入changes`。

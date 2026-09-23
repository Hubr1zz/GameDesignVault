---
name: kdm-dlc-research
description: >-
  研究并整理 Kingdom Death: Monster 非核心1.6内容。用于创建或更新 KDMDLC 下的
  Monster Expansion、Gameplay Expansion、Vignette、Wanderer、Campaign 等中文资料，
  重点记录装备、失调、事件、专属机制、来源、触发条件与具体效果，并控制未发行内容的不确定性。
---

# KDM DLC Research

将扩展资料整理成能快速定位规则的中文 Markdown，而不是产品宣传或设计评论。

## 1. 确定范围与状态

1. 先读 `zWorkFlow_Design/manage-design-repository/SKILL.md`、`.design-workflow/workspace-map.md`、`.design-workflow/project-rules.md`、`待办清单.md` 和已有同类文档。
2. 以 KDM 1.6 核心盒为比较基准。Expansions of Death Vol. I 的十二个旧扩展只有在用户明确要求时才纳入。
3. 收录带实质玩法组件的官方产品：Monster/Campaign Expansion、Gameplay Expansion、Vignette、Wanderer、Pillar、Seed Pattern、Indomitable/Anniversary/Echoes 等。
4. 排除纯树脂展示模型、Pinup、Bust、骰子和无规则卡的周边。
5. 每个产品标记状态：`已发行且规则可核验`、`正在发货/资料逐步公开`、`未发行/开发中`。未发行内容只记录官方已公布信息，不编造卡牌效果。

## 2. 资料优先级

按以下顺序交叉核验：

1. 官方规则书、FAQ、勘误、产品页、Kickstarter 更新和官方 News of Death。
2. `kingdomdeath.wiki` 与 `kingdomdeath.fandom.com` 的卡牌或规则条目。
3. BGG、Vibrant Lantern、社区整理和中英文讨论，用于补缺，不单独支撑关键规则。

每页末尾列出直接来源链接。效果无法从公开文本确认时写“待核验”，不要根据卡名或宣传文案推断。

## 3. DLC 文件结构

每个 DLC 建独立文件夹，默认包含：

- `总览.md`：类型、状态、加入方式、替换节点、内容清单、专属系统和阅读导航。
- `装备与制作.md`：装备名称、类别、制作/取得来源、前置条件、具体效果。
- `失调与能力.md`：失调、战斗技艺、秘密战斗技艺、Knowledge 等，逐项写来源和效果。
- `事件与流程.md`：故事事件、据点事件、狩猎事件及触发链。
- `怪物机制.md`：只选标志性 AI/HL、独立牌堆、地形和阶段机制，不逐张抄录普通 AI/HL。

小型 Gameplay Expansion 可合并为一个 `内容索引.md`，但字段不得省略。

## 4. 写作要求

- 中文为主，首次出现时保留英文原名，便于查卡。
- 先解释“它是什么、何时使用、怎样获得”，再写效果。
- DLC 专属名词首次出现必须解释；基础 1.6 已有术语只在容易混淆时简注。
- 不写“设计作用”“设计观察”或宣传式简介。
- 每个新系统至少给一个具体结算案例。案例必须与已核验规则一致，并明确哪些数值来自示例假设。
- 表格用于固定字段检索；长事件链和复杂机制改用分段或编号流程，避免超宽表格。
- 逐项效果采用规则摘要，保留关键数值、时机、限制、归档/死亡等代价，不大段复制原文。

## 5. 卡牌最小字段

每张有效果的卡至少记录：

| 字段 | 内容 |
|---|---|
| 名称 | 中文译名（英文原名） |
| 类型 | Gear / Disorder / Fighting Art / Event / Knowledge 等 |
| 来源 | 所属 DLC、卡池、怪物或事件 |
| 获取/触发 | 制作地点和资源、抽取方式、事件分支或解锁条件 |
| 效果 | 时机、目标、数值、持续时间、次数限制与负面后果 |
| 状态 | 已核验 / 待核验 / 未公开 |

名称存在但公开效果缺失时仍可列入，效果栏写明缺失范围。

## 6. 完成检查

1. 检查文件夹索引能否导航到所有子页。
2. 搜索未解释的 DLC 术语、残留英文整段、`设计作用` 和 `设计观察`。
3. 核对每项是否同时有来源/触发和效果，怪物部分是否避免机械抄全牌库。
4. 更新 `待办清单.md`：只加入明确且尚未开始的资料缺口。
5. 更新 `修改历史.md`：记录内容资料变更；仅修改本 skill 时不记录。

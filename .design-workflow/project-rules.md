# GameDesignVault 项目规则

本文件只写本仓库特有的约束。通用流程（记录灵感、审查门、晋升、记录维护、校验）在 `manage-design-repository` skill 里，字段和取值的权威定义在 `profile.yml` 里，这里不重复。

## 定位

- 本仓库是《Hunting in Darkness》的独立文档层，不依赖游戏代码项目。
- 仓库内的 Markdown 是唯一事实来源。正常维护时不使用 Notion 工具或 Notion 数据库 ID，除非用户明确要求比较或导入。

## 语言与命名

- 笔记正文用中文。灵感标题用简洁中文，除非用户要求英文标题。
- 术语页的文件名就是词条名，`中文` 字段与文件名一致，正文以 `# 词条名` 开头。
- 引用已有页面定义的概念时用 wiki 链接并保留自然读法，例如死亡判定定义在 `猎人 Hunter`，写作 `[[猎人 Hunter|死亡判定]]`。

## 取值含义

允许的取值以 `profile.yml` 为准，这里只解释含义。

| 字段 | 取值 | 含义 |
|---|---|---|
| `scope` | `System` | 规则、机制、流程或系统行为 |
| | `Content` | 具体内容：道具、文案、角色、事件、遭遇 |
| | `Mixed` | 旧合集页，同时含两类想法，等待拆分。新笔记不得使用 |
| 灵感 `status` | `New` | 尚未进入正式设计 |
| | `Adopted` | 已写入正式设计，`related` 指向对应文档 |
| | `Rejected` | 已决定不采用，保留作记录 |
| 问题 `status` | `Open` / `Resolved` / `Dropped` | 未解决 / 已在正式设计中解决 / 不再处理 |
| 案例 `status` | `Stub` | 占位页，只有标题或填写说明 |
| | `Draft` | 有内容，尚未确认成型 |
| | `Done` | 用户确认已成型。只有用户可以判定 |

术语页的 `location` 指向该术语的主要定义文档。尚未确定时留空，[[术语词典]] 页面会把它列入未补全清单。

## 修改历史分类

`修改历史.md` 的 `分类` 列和提交信息前缀使用同一组分类：

`决战战斗` `探索狩猎` `营地建设` `美术` `叙事设定` `UI/表现` `术语词典` `文档整理` `其他`

提交信息格式为 `分类: 摘要`。

## 工具视图

下列文件是 frontmatter 的投影。改字段名或移动目录时必须同步更新。

| 文件 | 工具 | 读取的字段 |
|---|---|---|
| `库视图.base` | Obsidian Bases | `type` `status` `scope` `related` `created`，按目录 `灵感库` 过滤 |
| `术语词典.md` 中的 Dataview 查询 | Obsidian Dataview | `中文` `english` `location`，按目录 `术语词典` 过滤 |

## 目录约定

- `参考资料/KDM/` 由 `kdm-dlc-research` skill 维护，写作要求见该 skill。
- `美术参考/ai生成/<套号>/` 每套一个目录，按 `ui` `概念美术` `怪物设计` `插画` `装备` 分类，提示词与参数写在该套的 `生成记录.md`，总索引是 `美术参考/ai生成/README.md`。
- 手工收集的参考图按主题放在 `美术参考/` 的子目录里，并在 `美术参考/参考图索引.md` 写一行说明。
- `prototypes/` 是可运行原型的代码，不受本工作流管理，也不参与校验。

## 规格桥接

`profile.yml` 的 `integrations.external_spec_bridge` 开启时适用。桥接的配置和运行状态在 `.agent-bridge/`，属于本机文件，不进版本库。

- 只有本轮任务可能修改或已经修改 `设计文档/` 内的正式设计内容，或用户明确要求手动导入指定正式文档时，才读取 `.agent-bridge/project-sync.json`。文件不存在或 `enabled=false` 时立即结束，不加载项目层内容。启用时读取 `.agents/skills/document-change-to-openspec/SKILL.md` 并照做。
- 自动导入在任务开始时建立变更基线，结束时只检测 `设计文档/` 内正式设计内容的变化。手动导入只处理用户指定的正式文档。两者都只生成导入报告及其中的 Spec 提案。
- 自动同步不得运行 OpenSpec 命令，不得调用 `openspec-propose` 或 `openspec-update-change`，不得创建 `openspec/changes/*`、写入 delta spec、apply、sync 或 archive。导入报告中的 Spec 提案不是 OpenSpec change，也不是正式 Spec。
- OpenSpec draft change 只能由用户在导入报告面板对具体 Spec 提案点击“加入changes”后创建。正式 Spec 只能在用户通过对话明确要求归档对应 open change 后生成。
- 纯问答、只读检索、记录灵感、记录问题、术语词典维护、内容设计案例维护、编辑器配置、工作流或 skill 规则更新、只改 frontmatter 或链接的整理、待办清单或修改历史维护，都不触发桥接。这些任务没有实质改动 `设计文档/` 时，不得读取项目层内容。

# 术语词典

共 33 条术语。需要安装 Dataview 插件以显示下方表格。

```dataview
TABLE english AS "English", location AS "所在文档"
FROM "术语词典"
WHERE file.name != "INDEX"
SORT 中文 ASC
```

---

## 未补全 Location 的词条

以下词条尚未关联到具体文档（可点击词条跳转添加）：

```dataview
TABLE english AS "English"
FROM "术语词典"
WHERE file.name != "INDEX" AND location = null
SORT 中文 ASC
```


# master11408

笔记、习题与考点知识图谱学习工具，使用 Vue、Hono 和 Cloudflare D1。

## 知识图谱

设计、frontmatter 格式及实施记录见 [知识图谱设计文档](docs/knowledge-graph-design.md)。

- 题目通过 `notes` 关联考点笔记，笔记通过 `references` 引用其他笔记；两者都在 Markdown frontmatter 中填写稳定 ID。
- 反向链接和图谱由内容同步自动生成。
- 每科图谱位于 `/graph/:subjectId`，默认展示笔记，选中笔记可展开关联习题。
- 做题时可在侧边抽屉阅读笔记，并保留当前答案。

本地更新后执行：

```bash
pnpm db:migrate:local
pnpm content:sync:local
pnpm dev
```

验证使用 `pnpm check` 和 `pnpm exec playwright test --workers=2`。

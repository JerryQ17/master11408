---
id: cs408.ds.tree.001
type: single_choice
difficulty: 3
topics:
  - cs408.data-structures
  - cs408.ds.tree
tags:
  - practice.sample
  - practice.sample.cs408
source_kind: original
options:
  - key: A
    content: 127
  - key: B
    content: 128
  - key: C
    content: 255
  - key: D
    content: 256
answer: B
---

## 题目

一棵包含 $255$ 个结点的完全二叉树，其叶结点的总数为：

## 解析

对于任何二叉树，设度为 $0$（叶结点）的结点数为 $n_0$，度为 $1$ 的结点数为 $n_1$，度为 $2$ 的分支结点数为 $n_2$。
由二叉树基本性质知：

$$n_0 = n_2 + 1 \implies n_2 = n_0 - 1$$

总结点数 $n = n_0 + n_1 + n_2 = 2n_0 + n_1 - 1$。
在完全二叉树中，$n_1$ 只能取 $0$ 或 $1$。
本题中 $n = 255$ 为奇数，因此 $2n_0 + n_1 - 1 = 255 \implies 2n_0 + n_1 = 256$。
由于 $2n_0$ 为偶数，故 $n_1$ 必须为偶数，即 $n_1 = 0$。
于是：

$$2n_0 = 256 \implies n_0 = 128$$

叶结点的总数为 $128$。故正确答案为 B。

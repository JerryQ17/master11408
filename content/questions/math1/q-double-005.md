---
id: math1.double-integral.005
type: single_choice
difficulty: 3
topics:
  - math1.double-integral.definition
tags:
  - practice.sample
  - practice.sample.math1
source_kind: original
options:
  - key: A
    content: '$I_1 > I_2$'
  - key: B
    content: '$I_1 < I_2$'
  - key: C
    content: '$I_1 = I_2$'
  - key: D
    content: '无法比较'
answer: B
---

## 题目

设 $D = [1, 2] \times [1, 2]$，记 $I_1 = \iint_D (x + y) \, dx dy$，$I_2 = \iint_D (x + y)^2 \, dx dy$，比较 $I_1$ 与 $I_2$ 的大小关系：

## 解析

在区域 $D$ 上，$x \ge 1, y \ge 1$，因此 $x + y \ge 2 > 1$。
因为当 $u > 1$ 时必有 $u < u^2$，所以在区域 $D$ 的内部恒有：

$$x + y < (x + y)^2$$

由二重积分的保号性与比较性质，可知 $I_1 < I_2$。正确选项为 B。

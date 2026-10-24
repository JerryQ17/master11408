---
id: math1.double-integral.008
notes:
  - note.math1.double-integral.def
type: single_choice
difficulty: 4
topics:
  - math1.double-integral.definition
tags:
  - practice.sample
  - practice.sample.math1
source_kind: original
options:
  - key: A
    content: '$\frac{1}{2}$'
  - key: B
    content: '$1$'
  - key: C
    content: '$\frac{3}{2}$'
  - key: D
    content: '$2$'
answer: D
---

## 题目

设闭区域 $D = \{(x, y) \mid 0 \le x \le 2, 0 \le y \le 2\}$，若 $f(x, y)$ 在 $D$ 上连续且其平均值为 $\frac{1}{2}$，则 $\iint_D f(x, y) \, dx dy$ 的值为：

## 解析

根据二元函数在平面闭区域上的平均值定义：

$$\overline{f} = \frac{1}{\sigma(D)} \iint_D f(x, y) \, dx dy$$

区域 $D$ 是边长为 $2$ 的正方形，其面积为 $\sigma(D) = 2 \times 2 = 4$。
已知 $\overline{f} = \frac{1}{2}$，因此：

$$\iint_D f(x, y) \, dx dy = \overline{f} \cdot \sigma(D) = \frac{1}{2} \times 4 = 2$$

故选 D。

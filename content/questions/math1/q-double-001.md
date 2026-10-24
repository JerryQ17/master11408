---
id: math1.double-integral.001
notes:
  - note.math1.double-integral.def
  - note.math1.double-integral.calc
type: single_choice
difficulty: 2
topics:
  - math1.double-integral.definition
tags:
  - practice.sample
  - practice.sample.math1
source_kind: original
options:
  - key: A
    content: '$0$'
  - key: B
    content: '$\frac{1}{2}$'
  - key: C
    content: '$1$'
  - key: D
    content: '$2$'
answer: C
---

## 题目

设区域 $D = [0, 1] \times [0, 1]$，求二重积分：

$$\iint_D (x + y) \, dx dy$$

## 解析

由对称性可知，$\iint_D x \, dx dy = \iint_D y \, dx dy$。
计算单项：

$$\iint_D x \, dx dy = \int_0^1 x \, dx \int_0^1 1 \, dy = \left[\frac{1}{2}x^2\right]_0^1 \cdot 1 = \frac{1}{2}$$

故所求积分为 $\frac{1}{2} + \frac{1}{2} = 1$。正确选项为 C。

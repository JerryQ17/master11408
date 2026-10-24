---
id: math1.double-integral.002
notes:
  - note.math1.double-integral.calc
type: single_choice
difficulty: 2
topics:
  - math1.double-integral.definition
  - math1.double-integral.cartesian
tags:
  - practice.sample
  - practice.sample.math1
source_kind: original
options:
  - key: A
    content: '$\frac{1}{6}$'
  - key: B
    content: '$\frac{1}{3}$'
  - key: C
    content: '$\frac{1}{2}$'
  - key: D
    content: '$1$'
answer: B
---

## 题目

设闭区域 $D$ 是由直线 $y = x$，$x = 1$ 与 $x$ 轴所围成的三角形闭区域，求二重积分：

$$\iint_D x \, dx dy$$

## 解析

积分区域为 $D = \{(x, y) \mid 0 \le x \le 1, \, 0 \le y \le x\}$。
化为累次积分：

$$\iint_D x \, dx dy = \int_0^1 dx \int_0^x x \, dy = \int_0^1 x^2 \, dx = \left[\frac{1}{3}x^3\right]_0^1 = \frac{1}{3}$$

故正确答案为 B。

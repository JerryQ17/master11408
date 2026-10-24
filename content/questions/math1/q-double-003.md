---
id: math1.double-integral.003
notes:
  - note.math1.double-integral.properties
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
    content: '$0$'
  - key: B
    content: '$\pi$'
  - key: C
    content: '$2\pi$'
  - key: D
    content: '$4$'
answer: A
---

## 题目

设区域 $D = \{(x, y) \mid x^2 + y^2 \le 1\}$，则二重积分：

$$\iint_D (x^3 + \sin y) \, dx dy = $$

## 解析

积分区域 $D$ 是关于 $x$ 轴和 $y$ 轴均对称的闭圆盘。

- 被积函数项 $x^3$ 关于 $x$ 是奇函数，区域关于 $y$ 轴（$x=0$）对称，故 $\iint_D x^3 \, dx dy = 0$。
- 被积函数项 $\sin y$ 关于 $y$ 是奇函数，区域关于 $x$ 轴（$y=0$）对称，故 $\iint_D \sin y \, dx dy = 0$。

二者之和积分为 $0 + 0 = 0$。故正确答案为 A。

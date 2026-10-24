---
id: math1.double-integral.009
notes:
  - note.math1.double-integral.calc
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
    content: '$\frac{1}{4}$'
  - key: B
    content: '$\frac{1}{2}$'
  - key: C
    content: '$\frac{5}{6}$'
  - key: D
    content: '$1$'
answer: C
---

## 题目

设区域 $D = [0, 1] \times [0, 1]$，求 $\iint_D (x^2 + y) \, dx dy$ 的值：

## 解析

将二重积分拆分为两项：

$$\iint_D x^2 \, dx dy + \iint_D y \, dx dy$$

分别在矩形区域上化为累次积分：

$$\iint_D x^2 \, dx dy = \int_0^1 x^2 \, dx \int_0^1 1 \, dy = \frac{1}{3} \cdot 1 = \frac{1}{3}$$
$$\iint_D y \, dx dy = \int_0^1 1 \, dx \int_0^1 y \, dy = 1 \cdot \frac{1}{2} = \frac{1}{2}$$

相加得：

$$\frac{1}{3} + \frac{1}{2} = \frac{5}{6}$$

故正确答案选 C。

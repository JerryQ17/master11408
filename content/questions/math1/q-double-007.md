---
id: math1.double-integral.007
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
    content: '$1$'
  - key: C
    content: '$e$'
  - key: D
    content: '$e^2$'
answer: A
---

## 题目

设闭区域 $D = \{(x, y) \mid -1 \le x \le 1, -1 \le y \le 1\}$，则 $\iint_D x e^{y^2} \, dx dy = $：

## 解析

积分区域 $D$ 关于 $y$ 轴对称（即若 $(x, y) \in D$，则 $(-x, y) \in D$）。
被积函数 $f(x, y) = x e^{y^2}$ 关于自变量 $x$ 满足：

$$f(-x, y) = -x e^{y^2} = -f(x, y)$$

即为关于 $x$ 的奇函数。由二重积分的奇偶对称性定理可知积分为 $0$。正确选项为 A。

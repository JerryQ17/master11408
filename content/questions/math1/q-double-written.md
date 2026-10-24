---
id: math1.double-integral.written
notes:
  - note.math1.double-integral.calc
  - note.math1.double-integral.change-order
type: written
difficulty: 4
topics:
  - math1.double-integral.definition
  - math1.double-integral.cartesian
tags:
  - practice.sample
  - practice.sample.math1
source_kind: original
answer: 证明及计算步骤详见解析。所求积分为 \frac{1}{12}。
---

## 题目

设闭区域 $D$ 是由直线 $y = 0$，$x = 1$ 与抛物线 $y = x^2$ 所围成的平面闭区域。

1. 画出积分区域草图，并分别写出将 $\iint_D x y \, dx dy$ 化为先对 $y$ 后对 $x$ 以及先对 $x$ 后对 $y$ 的累次积分表达式；
2. 计算该二重积分的值。

## 解析

### 1. 区域分析与累次积分表达式

区域 $D$ 的边界为 $y = 0$（$x$ 轴），$x = 1$，以及 $y = x^2$。交点坐标为 $(0, 0)$ 和 $(1, 1)$。

- **先对 $y$ 后对 $x$（X-型区域）**：
  $x$ 的取值范围为 $[0, 1]$，对于固定的 $x$，$y$ 从 $0$ 变化到 $x^2$。
  累次积分表达式为：
  $$\iint_D x y \, dx dy = \int_0^1 dx \int_0^{x^2} x y \, dy$$

- **先对 $x$ 后对 $y$（Y-型区域）**：
  $y$ 的取值范围为 $[0, 1]$，从曲线方程解得 $x = \sqrt{y}$。对于固定的 $y$，$x$ 从 $\sqrt{y}$ 变化到 $1$。
  累次积分表达式为：
  $$\iint_D x y \, dx dy = \int_0^1 dy \int_{\sqrt{y}}^1 x y \, dx$$

### 2. 积分计算

选用先对 $y$ 积分：
$$\int_0^1 dx \left[ x \cdot \frac{1}{2} y^2 \right]_{y=0}^{y=x^2} = \int_0^1 x \cdot \frac{1}{2} x^4 \, dx = \frac{1}{2} \int_0^1 x^5 \, dx = \frac{1}{2} \left[ \frac{1}{6} x^6 \right]_0^1 = \frac{1}{12}$$

故二重积分的值为 $\frac{1}{12}$。

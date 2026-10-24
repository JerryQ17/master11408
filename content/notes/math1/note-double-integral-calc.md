---
id: note.math1.double-integral.calc
topic: math1.double-integral.cartesian
title: 二重积分在直角坐标系下的计算
order: 2
---

# 二重积分在直角坐标系下的计算

## 1. X-型与 Y-型区域

在直角坐标系下计算二重积分，核心思想是将二维积分化为两次定积分（即累次积分）。

### X-型区域（先 $y$ 后 $x$）

如果积分区域 $D$ 表示为：$D = \{(x, y) \mid a \le x \le b, \, \phi_1(x) \le y \le \phi_2(x)\}$，则：

$$\iint_D f(x, y) \, dx dy = \int_a^b dx \int_{\phi_1(x)}^{\phi_2(x)} f(x, y) \, dy$$

### Y-型区域（先 $x$ 后 $y$）

如果积分区域 $D$ 表示为：$D = \{(x, y) \mid c \le y \le d, \, \psi_1(y) \le x \le \psi_2(y)\}$，则：

$$\iint_D f(x, y) \, dx dy = \int_c^d dy \int_{\psi_1(y)}^{\psi_2(y)} f(x, y) \, dx$$

## 2. 交换积分次序

交换积分次序是 408 / 数学一常考的高频题型：

1. 根据累次积分限反求区域 $D$ 的边界曲线方程；
2. 绘制草图明确交点；
3. 将区域重写为另一种形态，重新确定内层和外层的积分上下限。

例如以下累次积分的转换逻辑伪代码：

```text
input: int_0^1 dx int_x^1 f(x,y) dy
region: 0 <= x <= 1, x <= y <= 1
project to y-axis: 0 <= y <= 1, 0 <= x <= y
output: int_0^1 dy int_0^y f(x,y) dx
```

:::question id=math1.double-integral.002

---
id: note.math1.double-integral.calc
topic: math1.double-integral.cartesian
title: X型与Y型积分区域
order: 3
references:
  - note.math1.double-integral.def
---

# X型与Y型积分区域

## 1. X-型与 Y-型区域

在直角坐标系下计算二重积分，核心思想是将二维积分化为两次定积分（即累次积分）。

### X-型区域（先 $y$ 后 $x$）

如果积分区域 $D$ 表示为：$D = \{(x, y) \mid a \le x \le b, \, \phi_1(x) \le y \le \phi_2(x)\}$，则：

$$\iint_D f(x, y) \, dx dy = \int_a^b dx \int_{\phi_1(x)}^{\phi_2(x)} f(x, y) \, dy$$

### Y-型区域（先 $x$ 后 $y$）

如果积分区域 $D$ 表示为：$D = \{(x, y) \mid c \le y \le d, \, \psi_1(y) \le x \le \psi_2(y)\}$，则：

$$\iint_D f(x, y) \, dx dy = \int_c^d dy \int_{\psi_1(y)}^{\psi_2(y)} f(x, y) \, dx$$

:::question id=math1.double-integral.002

---
id: note.math1.double-integral.def
topic: math1.double-integral.definition
title: 二重积分的定义与几何意义
order: 1
---

# 二重积分的定义与几何意义

## 1. 概念引入

设闭区域 $D \subset \mathbb{R}^2$，函数 $f(x, y)$ 在 $D$ 上有界。将 $D$ 任意分割成 $n$ 个小闭区域 $\Delta \sigma_1, \Delta \sigma_2, \dots, \Delta \sigma_n$。在每个 $\Delta \sigma_i$ 上任取一点 $(\xi_i, \eta_i)$，作和式：

$$I_n = \sum_{i=1}^n f(\xi_i, \eta_i) \Delta \sigma_i$$

若当各小区域直径的最大值 $\lambda \to 0$ 时，该和式的极限总存在且与区域的分割及点的选取无关，则称此极限为函数 $f(x, y)$ 在区域 $D$ 上的**二重积分**，记作：

$$\iint_D f(x, y) \, dx dy = \lim_{\lambda \to 0} \sum_{i=1}^n f(\xi_i, \eta_i) \Delta \sigma_i$$

## 2. 几何意义

- 当 $f(x, y) \ge 0$ 时，$\iint_D f(x, y) \, dx dy$ 表示以 $D$ 为底、曲面 $z = f(x, y)$ 为顶的曲顶柱体的体积。
- 特殊情形：当 $f(x, y) \equiv 1$ 时，$\iint_D 1 \, dx dy = \sigma(D)$，即区域 $D$ 的面积。

## 3. 重要性质

1. **线性性质**：$\iint_D [\alpha f(x,y) + \beta g(x,y)] \, dx dy = \alpha \iint_D f(x,y)\, dx dy + \beta \iint_D g(x,y)\, dx dy$
2. **区域可加性**：若 $D = D_1 \cup D_2$ 且 $D_1$ 与 $D_2$ 无公共内点，则 $\iint_D = \iint_{D_1} + \iint_{D_2}$
3. **对称性定理**（考研必考）：
   - 若 $D$ 关于 $y$ 轴对称，$f(x, y)$ 关于 $x$ 为奇函数，则积分为 $0$；为偶函数时等于半区域积分的 $2$ 倍。
   - 若 $D$ 关于 $y = x$ 对称，则 $\iint_D f(x) \, dx dy = \iint_D f(y) \, dx dy = \frac{1}{2} \iint_D [f(x) + f(y)] \, dx dy$。

:::question id=math1.double-integral.001

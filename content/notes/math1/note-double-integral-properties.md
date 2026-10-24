---
id: note.math1.double-integral.properties
topic: math1.double-integral.definition
title: 二重积分的性质与对称性
order: 2
references:
  - note.math1.double-integral.def
---

# 二重积分的性质与对称性

1. **线性性质**：$\iint_D [\alpha f(x,y) + \beta g(x,y)] \, dx dy = \alpha \iint_D f(x,y)\, dx dy + \beta \iint_D g(x,y)\, dx dy$
2. **区域可加性**：若 $D = D_1 \cup D_2$ 且 $D_1$ 与 $D_2$ 无公共内点，则 $\iint_D = \iint_{D_1} + \iint_{D_2}$
3. **对称性定理**（考研必考）：
   - 若 $D$ 关于 $y$ 轴对称，$f(x, y)$ 关于 $x$ 为奇函数，则积分为 $0$；为偶函数时等于半区域积分的 $2$ 倍。
   - 若 $D$ 关于 $y = x$ 对称，则 $\iint_D f(x) \, dx dy = \iint_D f(y) \, dx dy = \frac{1}{2} \iint_D [f(x) + f(y)] \, dx dy$。

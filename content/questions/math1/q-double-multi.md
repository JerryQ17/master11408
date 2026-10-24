---
id: math1.double-integral.multi
notes:
  - note.math1.double-integral.properties
type: multiple_choice
difficulty: 4
topics:
  - math1.double-integral.definition
  - math1.double-integral.cartesian
tags:
  - practice.sample
  - practice.sample.math1
source_kind: original
options:
  - key: A
    content: '若 $D$ 关于 $y$ 轴对称且 $f(-x, y) = -f(x, y)$，则积分必为 $0$'
  - key: B
    content: '若 $D$ 关于原点对称且 $f(-x, -y) = -f(x, y)$，则积分必为 $0$'
  - key: C
    content: '若 $D$ 关于直线 $y = x$ 对称，则 $\iint_D f(x) \, dx dy = \iint_D f(y) \, dx dy$'
  - key: D
    content: '无论被积函数是否连续，二重积分总可以化为累次积分'
answer:
  - A
  - C
---

## 题目

关于闭区域 $D$ 上的二重积分性质与对称性，下列命题中正确的有（多选）：

## 解析

- **A 正确**：区域关于 $y$ 轴对称，且被积函数关于 $x$ 为奇函数，由奇偶对称性定理，二重积分必为 $0$。
- **B 错误**：区域关于原点对称（中心对称），若 $f(-x, -y) = -f(x, y)$，由于二重积分的换元变换雅可比行列式绝对值等于 $1$，原点奇对称不能直接得出积分为 $0$（极坐标下 $\theta \to \theta + \pi$ 需具体分析角度区间，常规原点对称是关于单轴反对称相消，中心反对称一般不成立）。
- **C 正确**：由轮换对称性，当区域关于 $y = x$ 对称时，交换积分变量 $x$ 与 $y$ 不变，因此 $\iint_D f(x) \, dx dy = \iint_D f(y) \, dx dy$。
- **D 错误**：化累次积分要求二元函数满足富比尼定理（Fubini's Theorem）的适定条件（如连续或绝对可积），非连续有界函数不保证累次积分总可交换计算。

综上所述，正确选项为 A、C。

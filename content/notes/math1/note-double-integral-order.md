---
id: note.math1.double-integral.change-order
topic: math1.double-integral.cartesian
title: 交换积分次序
order: 4
references:
  - note.math1.double-integral.calc
---

# 交换积分次序

交换积分次序需要根据积分区域重新确定上下限：

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

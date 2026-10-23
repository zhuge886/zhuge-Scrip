# 按功能验证

每个功能的开发检查独立存放，避免不同脚本的依赖与验证混在一起。

| 功能 | 检查目录 | 内容 |
| --- | --- | --- |
| 电量监控 | [battery-widget](battery-widget) | TypeScript 严格检查、56 项 JS/虚拟节点回归检查 |

在仓库根目录执行：

```sh
npm --prefix verification/battery-widget ci
npm --prefix verification/battery-widget run typecheck
npm --prefix verification/battery-widget test
```

类型检查首次运行会下载固定提交并校验哈希的公开运行时声明镜像。
该声明并非本次 iPhone 实时同步版本；原生渲染、权限、硬件和 WidgetKit 调度仍需真机检查。

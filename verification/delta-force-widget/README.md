# 三角洲收益检查

```sh
sh fetch-types.sh
npm ci --ignore-scripts
npm run check
```

55 项合成数据测试覆盖查询、续期、7天历史与独立桌面视图；执行实际 widget.tsx 入口的模拟回归，核对内容树的白灰内容底层、单日紧凑布局、红绿收益、显式透明参数及 Widget.preview 调用。

节点和模拟入口检查不等同于 iPhone 原生渲染验证。手机请用应用内“预览桌面组件”核对实际结果。见 [验证记录](../../delta-force-widget/VERIFICATION.md)。

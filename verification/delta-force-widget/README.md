# 三角洲收益检查

```sh
sh fetch-types.sh
npm ci --ignore-scripts
npm run check
```

62 项合成测试覆盖查询、扫码、续期、历史迁移、账号隔离、并发、离线缓存，以及原生桌面入口、累计收益映射、每日正负柱、0 / 1 / 2 / 3 / 7 条记录、缺失日期、长金额、明暗 / 透明主题、旧宿主 Canvas 降级及两种 Widget.preview 调用。

Canvas 指令检查不依赖截图：验证逐段方向、控制点范围、真实记录数量、有限坐标与真实日期标签。材质和渐变位于内容树，当前没有远程图片资源依赖。

类型、节点和绘图指令测试不等同于 iPhone 原生验收。手机请使用应用内小号 / 中号原生预览，见 [验证记录](../../delta-force-widget/VERIFICATION.md)。

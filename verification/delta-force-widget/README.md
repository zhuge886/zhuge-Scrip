# 三角洲收益检查

```sh
sh fetch-types.sh
npm ci --ignore-scripts
npm run check
```

固定 TypeScript 与宿主声明。40 项合成数据测试模拟网络、Keychain、WebView 和界面节点，覆盖最近收益、缓存、扫码与 OAuth 自动续期及凭据隔离，并检查白底文字对比度、反差色金额和三种透明模式。类型目录和 node_modules 不提交。

不能替代 iPhone 的真实扫码、续期与透明组件验收，更未执行连续一个月登录测试。见 [验证记录](../../delta-force-widget/VERIFICATION.md)。

# 三角洲收益检查

```sh
sh fetch-types.sh
npm ci --ignore-scripts
npm run check
```

固定 TypeScript 版本及宿主声明镜像，类型目录和 node_modules 不提交。`smoke.cjs` 用合成夹具模拟网络、钥匙串和 WebView，检查日期、凭据处理、登录生命周期和缓存。它不能替代微信授权与桌面布局的真机验证。

完整范围见 [验证记录](../../delta-force-widget/VERIFICATION.md)。

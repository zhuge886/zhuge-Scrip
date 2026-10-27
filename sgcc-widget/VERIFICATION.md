# 1.5.2 验证记录

## 已完成

- TypeScript 5.8.3 严格检查通过，**95项离线检查通过**。
- 核对官方 Android 3.2.3 SDK 的 `EleUtils.objectSuccess`：空 common 会进入外层 code 检查，0 为成功；读取资料仍由 `ObjectApiUtils.getData` 提取 `data.data`。这直接支持本轮解析修复。
- 新增6项检查：空/缺失 common 的明确成功与真实零值、原业务成功分支保持、非零/缺失/畸形状态拒绝、身份和验证/金额门槛保持、自动入口保存及扩展诊断脱敏。
- 保留原89项检查，包括错误优先显示、缓存隔离、会话续期、供电公司尝试边界及五种组件尺寸。
- 用户观察到的响应形状与 SDK 规则记录在 [payment-null-common.json](../verification/sgcc-widget/payment-null-common.json)，不保存用户户号、凭证、诊断时间或内层资料。
- 查阅政府网站发布的网上国网 App 和微信小程序使用指引，确认交费入口支持其他户号，且交费列表与绑定列表不同。来源见 [研究记录](RESEARCH.md)。

测试全部离线使用合成户号、金额和响应。此前两次空目标匿名错误样本仍见 [payment-gateway-errors.json](../verification/sgcc-widget/payment-gateway-errors.json)，它们不是本轮用户的响应，不能替代本轮 `code: 0` 的证据。

公开 Scripting 类型声明固定为 `Yii-An/Scripting-Scripts@be3ea45b820b16c11fa7ce0b332b9b0e32ec5a3b/dts`。

## 尚未验证

用户提供的实际诊断只证明外层 `code: 0`、空 `common`、内层对象，不包含内层户号、验证状态或金额。仍需在手机验证这些字段是否齐全、身份是否一致、金额是否与官方 App 一致。

本轮未使用用户登录凭证、未发送短信、未查询实际户号；没有新的生产接口请求。没有验证微信小程序与 App 的登录票据可以互换，也没有将截图域名拼成新查询接口。离线合成金额不代表实际查询成功。

## 重现

```sh
cd verification/sgcc-widget
npm ci
sh fetch-types.sh
npm run check
npm test
```

不需要真实国网凭证。运行时声明快照可能与实际安装版本不同，仍需手机验收。

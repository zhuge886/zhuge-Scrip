# 接口分析

调查日期：2026-10-23。分析范围为腾讯官网 H5 登录资源、公开调用代码及不携带账号凭据的接口响应。没有对游戏二进制逆向，没有手机抓包；未观察到用户的已登录响应。

## 数据接口

两次查询均为 `POST https://comm.ams.game.qq.com/ide/`，请求体使用 `application/x-www-form-urlencoded`。登录信息通过 `Cookie` 头传递：`acctype=wx`、`appid`、`openid`、`access_token`。参数中 `sIdeToken` 是公开活动参数，不是用户 access token。

| 指标 | 请求参数 | 响应字段与解释 |
| --- | --- | --- |
| 总哈夫币 | `iChartId=319386`、`sIdeToken=zMemOt`、`type=3`、`item=17020000010` | `jData.data[]` 中的 `totalMoney`；请求按哈夫币物品 ID 过滤，若响应带物品 ID / 名称还会复核 |
| 昨日收益 | `iChartId=316969`、`sIdeToken=NoOapI`、`source=2`、`method=dfm/center.recent.detail`、`param={"resourceType":"sol"}` | `jData.data.data.solDetail.recentGain`；必须同时校验 `recentGainDate` |

日报接口返回最近一期数据，不假设其一定属于昨天。脚本不向该原始接口传入未经核实的历史日期参数。没有昨日数据时显示 `--`。`recentGain` 的经济口径由腾讯定义，不能保证等于两天现金余额之差，也没有重新从近 50 场战绩计算。哈夫币使用整数文本保存和格式化，避免大数精度丢失。

已实际观察到两个接口在无登录时均返回：

```json
{ "ret": 101, "iRet": 101, "sMsg": "非常抱歉，请先登录！" }
```

此时响应没有 `jData`，必须先判断登录错误再解析业务字段。接口返回的原始错误不直接展示，以免包含账号信息。两个查询独立处理，单个失败不会丢弃另一个成功值。

## 微信授权

已下载并静态检查的腾讯资源：

- [官网入口](https://df.qq.com/cp/a20240906main/index.html) 与 [页面逻辑 index.js](https://df.qq.com/cp/a20240906main/js/index.js)。页面明确使用移动微信 App ID `wx1cd4fbe9335888fe`，并接受扫码微信 App ID `wxfa0c35392d06b82f`。
- [Milo SDK](https://game.gtimg.cn/images/js/milo-next/latest/milo.min.js)。确认 `Milo.loginByWX()`、`Milo.Login.wxCodeToOpenid()`、扫码回调和本机 Cookie 写入路径。
- [微信移动中转页](https://iu.qq.com/comm-htdocs/login/milosdk/wx_mobile_redirect.html) 与 [官网移动回调页](https://df.qq.com/comm-htdocs/login/milosdk/wx_mobile_callback.html)。确认中转页对 `s_url` 的检查，以及官网使用 SDK 换取登录态的方式。

扫码方式在腾讯官网调用 `Milo.loginByWX()`；本机方式使用微信 `connect/oauth2/authorize`，本人确认后将含 code / state 的腾讯中转链接交回脚本，由官网 SDK 完成处理。每次授权使用独立临时 WebView，Cookie 读取限于腾讯官网，随后查询哈夫币成功才保存。脚本不包含 AppSecret，也没有自行构造微信 token 交换接口。

本机授权对回调的主机、路径、App ID、账号类型、state、重复参数和时效进行校验。网络查询拒绝重定向，不把账号 Cookie 带到其他目的地。没有自动刷新 access token；登录过期需本人重新授权。

## 来源与稳定性

原始查询参数的公开实现参考 [zhuba-Ahhh/df-api 的 info.service.ts（固定提交）](https://github.com/zhuba-Ahhh/df-api/blob/66f1225bc2c16f1909352a65fdc0584d48d8dae6/src/info/info.service.ts)。收益和货币字段另与 [Daily.js](https://github.com/Entropy-Increase-Team/delta-force-plugin/blob/1a00e85a8a32078b2fd1124a4776d131fb62eefb/apps/report/Daily.js) 和 [Money.js](https://github.com/Entropy-Increase-Team/delta-force-plugin/blob/1a00e85a8a32078b2fd1124a4776d131fb62eefb/apps/info/Money.js) 核对。

这些是腾讯服务当前被公开代码使用的接口，不是腾讯向本项目提供的稳定开放 API 承诺。接口成功路径依据上述公开结构实现，测试使用合成数据。角色授权范围、真机 Cookie 可用性和实际金额仍需本人账号验收。

Scripting API 依据 [WebViewController](https://scriptingapp.github.io/zh/guide/Device%20Capabilities/WebViewController)、[fetch](https://scriptingapp.github.io/guide/Utilities/Request/fetch) 与 [Widget](https://scriptingapp.github.io/TestFlight/zh/guide/Widget/Widget%20API) 文档及固定版本公开声明检查。

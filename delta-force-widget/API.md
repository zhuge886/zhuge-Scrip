# 接口分析与 1.1.0 修复依据

调查日期：2026-10-23。检查腾讯官网页面、SDK、公开活动配置及开源调用实现；没有用户已登录响应，未下载运行完整游戏客户端。

## 首版中确认的问题

1. 1.0.0 在保存登录前要求余额查询成功，因此接口错误会丢弃已完成的微信授权。1.1.0 以腾讯 SDK 成功回调确认授权，随后保存，查询结果另行报告。
2. 首版使用通用 comm.ams.game.qq.com 入口。当前官方活动配置使用游戏专属 **dfm.ams.game.qq.com/ide/**，账户类型 7 要求身份映射参数。
3. 首版失败不便排查。新版记录步骤和数字错误码，区分本机保存、接口鉴权、业务失败和缺少日报，不复制服务端原始错误。

这些是可确认的代码和配置差异。没有用户登录后的实际请求，不能断言哪项是该账号失败的唯一原因。

## 腾讯一手证据

- [官方战绩页](https://df.qq.com/cp/record202410ver/) 当前引用 [index-yXwCZ2lE.js](https://game.gtimg.cn/images/dfm/cp/record202410ver/index-yXwCZ2lE.js)。页面以 Milo.emit({actId:"21_3LXYAj", token, sData}) 调用，哈夫币参数为 type=3、item=17020000010。
- [当前公开活动配置](https://comm.ams.game.qq.com/ide/page/21_3LXYAj)：sIdeUrl 为 dfm.ams.game.qq.com/ide/；95ookO / NoOapI / zMemOt / sTzZS2 分别映射 316964 / 316969 / 319386 / 316965。对应账户类型为 7，目标游戏 App ID 为 wx39308a0a1bd83d22，并有角色选择要求。
- [Milo SDK](https://game.gtimg.cn/images/js/milo-next/latest/milo.min.js)：mergeDataToIDE 加 chart / subchart / token；postData 在账户类型 7 下加入 needGopenid=1、isPreengage=1，通过 flow.sIdeUrl 请求。

## 当前直接查询

POST https://dfm.ams.game.qq.com/ide/，表单编码。openid / access_token / appid / acctype 同时放入 Cookie 和 POST；保留授权原 App ID，加入 needGopenid=1、isPreengage=1、ams_targetappid=wx39308a0a1bd83d22。四元组同时入表单另参考 [AmsRemoteClient.kt](https://github.com/MissKisser/df-item-crafting-monitoring/blob/67d4d0a9e32e65bd4a191f35ba9512eaa29dbdeb/app/src/main/java/com/local/dfcraftmonitor/data/backend/AmsRemoteClient.kt)。

| 指标 | 参数 | 响应 |
| --- | --- | --- |
| 哈夫币 | chart / subchart 319386，zMemOt，type 3，item 17020000010 | jData.data[].totalMoney |
| 日报 | chart / subchart 316969，NoOapI，method dfm/center.recent.detail，source 7，param {"resourceType":"sol"} | jData.data.data.solDetail 的 recentGain / recentGainDate |
| 绑定状态 | chart / subchart 316964，95ookO | jData.bindarea，只读 |

原始字段亦与 [Game.php](https://github.com/coolxi-tech/deltaforce/blob/6a9308eeedbc34f0ec898f9de95cb619b8702289/app/controller/Game.php) 核对。

## 官网同步与小程序身份

官网同步在临时 WebView 中用已保存登录打开官方战绩页，本人确认角色后，通过官网相同的 Milo.emit 查询两指标。SDK 处理其 Cookie 同步、身份映射和路由。发现网页切换账号时拒绝混用数据；绑定由本人在官网操作，不编造角色签名。

小程序与 H5 的身份作用域可能不同。导入入口只在本机提取本人成功请求的四元组，支持 Cookie / POST 表单 / JSON；缺字段、非微信凭据或冲突输入会拒绝，不执行粘贴内容。它不支持任意请求重放。

## REA 实际使用记录

查找官方 [morluto/rea](https://github.com/morluto/rea)，临时安装 rea-agents@6.7.0，对已下载腾讯 JavaScript 运行 analyze-javascript-application。返回 execution_failure，诊断为 worker 启动后退出；doctor 未证明分析环境可用。没有把失败输出算作结论，也未安装原生引擎或修改 Codex 全局配置。

本次证据来自直接检查公开资源，不能声称 REA 已成功逆向微信小程序。

## 口径与限制

recentGain 采用腾讯日报口径，不保证等于余额差。日期不是昨日时昨日值为空，应用内说明最近一期日期和金额。金额以整数文本保存。

这是官网内部使用形式，没有面向本项目的稳定开放 API 承诺。真实微信、角色权限和 WidgetKit 行为仍须本人手机验收。

# 接口与日期口径

核对日期：2026-10-25。1.4.0 沿用现有扫码、续期及日报请求，新增本机7天历史与股票式折线。

## 查询

POST https://dfm.ams.game.qq.com/ide/，表单编码。openid / access_token / appid / acctype 同时放入 Cookie 和表单；保留扫码得到的 App ID，加入 needGopenid=1、isPreengage=1、ams_targetappid=wx39308a0a1bd83d22。

| 指标 | 表单参数 | 响应 |
| --- | --- | --- |
| 哈夫币余额 | chart / subchart 319386，zMemOt，type 3，item 17020000010 | jData.data[].totalMoney |
| 最近日报 | chart / subchart 316969，NoOapI，method dfm/center.recent.detail，source 7，param {"resourceType":"sol"} | jData.data.data.solDetail.recentGain / recentGainDate |

两请求并行、独立处理。余额鉴权失败不会把可用的日报判定为未登录；日报鉴权失败时提示重新扫码，保留已缓存收益。拒绝 HTTP 重定向，超时 10 秒。错误只显示本机固定文案，不回显服务端原文。

## 最新收益与缓存

recentGainDate 是收益日期；checkedAt 是本机请求时间；profit.updatedAt 是最近成功取得这份金额的时间，三者互不替代。1.2.0 不再将报告日期与昨日比较，始终展示接口返回的最近有效日报。

- 零收益和负收益均为有效记录；金额按整数文本保存。
- 跨日、接口空报告或退回更旧报告时，保留已知最近日报并标记缓存。
- 只有日期相同或更新的有效日报会替换已知记录。
- 余额查询失败时隐藏余额，避免把旧余额当成当前余额。
- 维持原 Keychain 和缓存键，迁移 1.1.0 中提示语内的最近日报，不要求升级时重新授权。
- 缓存按 App ID + OpenID 隔离；退出或更换登录后，旧的在途请求不能恢复旧账号数据。

## 公开依据

- [官方战绩页](https://df.qq.com/cp/record202410ver/) 及其 [前端脚本](https://game.gtimg.cn/images/dfm/cp/record202410ver/index-yXwCZ2lE.js)：Milo.emit 活动 21_3LXYAj、哈夫币品项及查询参数。
- [活动配置](https://comm.ams.game.qq.com/ide/page/21_3LXYAj)：专属域名、chart / token 映射、账户类型 7 和目标游戏 App ID。
- [Milo SDK](https://game.gtimg.cn/images/js/milo-next/latest/milo.min.js)：身份映射参数及路由；二维码沿用官方主页的 Milo.loginByWX，App ID wxfa0c35392d06b82f。
- 开源调用核对：[AmsRemoteClient.kt](https://github.com/MissKisser/df-item-crafting-monitoring/blob/67d4d0a9e32e65bd4a191f35ba9512eaa29dbdeb/app/src/main/java/com/local/dfcraftmonitor/data/backend/AmsRemoteClient.kt)、[Game.php](https://github.com/coolxi-tech/deltaforce/blob/6a9308eeedbc34f0ec898f9de95cb619b8702289/app/controller/Game.php)。

先前尝试过 [morluto/rea](https://github.com/morluto/rea) 6.7.0，分析 worker 启动失败；未将其作为成功分析的证据。本项目没有运行完整游戏客户端，也不能直接读取微信的小程序会话。

这些是官网内部接口，没有面向本脚本的稳定开放 API 承诺。扫码和最近日报已由用户反馈可用；余额权限、日报更新时机由腾讯决定。

## 自动续期

腾讯 Milo 的扫码换码逻辑会把 refresh_token 与 access_token 一并写入 Cookie；1.2.0 仅提取四元组，遗漏了续期凭据。1.3.0 在 SDK 确认登录后同时提取 refresh_token 和访问 Cookie 的有效时间，存入原 Keychain 记录。

续期调用微信的 HTTPS GET https://api.weixin.qq.com/sns/oauth2/refresh_token，参数为 appid、grant_type=refresh_token、refresh_token。请求格式核对 [wechat-oauth 实现](https://github.com/node-webot/wechat-oauth/blob/8cc3035da0dd4111ded27397d1cdac116e2b5656/lib/oauth.js)。它不需要应用 secret；未尝试取得或使用腾讯的应用 secret。

- 接近访问过期时间先续期；未获得过期时间时，在日报鉴权失败后尝试一次，成功后重试查询。
- 返回的 OpenID 必须与保存账号相同；保持 App ID、账户类型和原 30 天续期窗口。续期凭据轮换时更新 Keychain，不清除收益缓存。
- 新会话只替换仍然匹配的当前登录。退出、换号或其他请求更新 token 后，旧续期结果不能覆盖新状态。
- 游戏请求严格只使用原四元组，**不发送 refresh_token 或本机有效期字段**。
- 续期错误不回显服务端原始文本；断网暂时失败保留缓存与登录，不断言已经过期。
- 30 天是本地采用的固定续期尝试窗口，不是对微信端有效期的修改或实测保证。旧版缺失的 refresh_token 必须重新扫码获取。

## 透明组件

[公开 Scripting Widget 文档](https://github.com/Honye/scripting-scripts/blob/7c8d0045604c4a978e6d66a8ed820f7bd5150c28/documentation/widget_api/zh.md) 区分系统“透明背景小组件”与“用图片模拟透明背景”。isTransparentBackground 只表示图片模拟，不能代表所有透明模式。

1.3.1 读取 isTransparentMode / isBlurMode / isTransparentBackground，任一为 true 时省略白色 widgetBackground。普通模式设置白色 widgetBackground，并使用固定深色文案、深绿正收益和深红负收益，修复 1.3.0 固定白字导致普通白底组件看似空白的问题。旧宿主缺少新模式字段时安全回退到白底高对比样式。

透明模式使用 DynamicShapeStyle 适配浅色 / 深色文字和收益颜色；不使用 hooks，适合组件入口。脚本不能用只读模式属性切换系统组件类型。

## 1.4.0 本机收益历史

当前日报解析仍使用 recentGain / recentGainDate，没有新增未经核实的历史请求或回溯参数。按用户要求，每次查询后在原账号缓存内累计收益日期与整数金额。

Snapshot 升级到 version 3，新增 history: [{day, value}]；继续使用原 Keychain / 缓存键。读取 version 1 / 2 时保留原登录与最近金额，并将有效的现有日报迁移成一个历史点。只保留北京时间今天及前6天；按日期去重、排序，同日更新覆盖。空日期和无效金额不构成记录，零收益是有效记录。

在途请求完成时合并已经保存的历史，避免桌面和应用并发刷新丢失日期。同账号扫码及续期保留历史；换号、退出仍隔离并清除数据。断网时保留窗口内数据，窗口之外的旧金额可继续作为最近一期金额展示。

折线使用原生 Chart / LineChart，隐藏 X / Y 轴与图例，不添加数值注释。X 轴使用实际收益日期，日期间隔保留；只有一个点时用圆点表示。Y 几何用 BigInt 做相对归一化，避免大整数之间的小差异消失；屏幕金额始终保留原整数文本，不从绘图浮点数反算。

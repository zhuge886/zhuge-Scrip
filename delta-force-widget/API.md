# 接口与日期口径

核对日期：2026-10-23。保留用户已验证可用的微信扫码与日报请求，在 1.2.0 简化交互并调整展示口径。

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

# 接口与日期口径

核对日期：2026-10-27。1.7.0 沿用现有扫码、续期、日报请求与本机历史，仅更新展示映射与原生视图。下文旧版本章节是演变记录，当前行为见末节。

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

## 1.5.0 视觉调整

保留原请求、微信续期、缓存及7天累计逻辑，仅重做界面。主题由绿色改为天蓝色；桌面移除游戏名和币种文字。

图表继续使用真实收益日，隐藏坐标数字与注释。LineChart 和 AreaChart 采用 monotone 单调插值，渐变只作为图形填充，不构成新的观测记录；只保留最后一个圆点。单条数据不绘制填充面积，也不生成额外点。负收益金额保留红色，图表统一采用蓝色视觉。

应用内将摘要卡、趋势区和操作区分层，说明收进桌面入口弹窗；不增加交易、购买或组合等与数据无关的操作。

## 1.5.1 小组件蓝底

普通小组件的 widgetBackground 改为 #DBF1FF → #B8DEFB 浅天蓝渐变，与应用摘要主卡一致。文字、正 / 负金额与曲线使用加深配色，测试覆盖渐变两个端点的文字对比度。透明、模糊及图片透明模式继续省略底板，应用白色趋势区不受影响。接口、历史及续期逻辑未变。

## 1.5.2 桌面渲染与原生预览

用户截图显示 1.5.1 的蓝底没有出现在桌面。公开 [Widget 文档](https://github.com/Honye/scripting-scripts/blob/909bd07dd214be3758f5302013bf847270802d86/documentation/widget_api/zh.md) 说明 widgetBackground 在透明、模糊、图片透明、accessory 和 accented 等情况下可能被跳过。云端不能确认该手机上具体是背景被跳过、旧脚本绑定还是时间线未更新。

本次同时修改实际 widget.tsx 入口及其独立 widget-view.tsx：
- 默认蓝底不依赖透明 / 模糊标志；只有明确参数 transparent 或 {"background":"transparent"} 才开启透明。
- 根视图按 Widget.displaySize 定尺寸，背景设置为纯蓝回退，内容树另绘 Rectangle + gradient("linear")，避免只改背景修饰符。
- 历史少于两天时收起 Chart，保留金额、日期及记录天数，不再画一个孤点占据整个图表区。
- 应用中的“预览桌面组件”调用 Widget.preview，以明确的蓝色参数运行实际桌面入口，并显示当前样式版本 1.5.2，供手机确认渲染和桌面绑定。
- 更新后若桌面仍显示旧的“近7天”白底布局，应重新选择更新后的脚本；应用内提供添加与更新说明。

接口、续期、历史累计及账号缓存没有改变。

## 1.6.0 股市配色

根据最新参考图，底板从蓝色改为白色到极浅灰，采用股市常见的红涨绿跌约定：正收益红色、负收益绿色，零收益黑灰色。quoteColor 为应用和桌面提供统一金额 / 曲线颜色，填充为同色浅渐变。

保留独立 Rectangle 内容底层、实际 widget.tsx 入口、单日紧凑布局及原生预览。默认预览参数改为 {"background":"stock"}；transparent 参数仍可启用透明。查询、续期及历史累计逻辑未改。

## 1.7.0 累计图表与轻磨砂视图

历史保存仍使用 Snapshot version 3 和原存储键，不新增请求或素材下载。trendSeries 先筛选真实7日记录，再用 BigInt 逐日累加；保留每日 value、cumulative、sign，只有 y / bar 几何做有限比例转换。统计按每日正负计数，最新金额仍来自 snapshot.profit，不能用 cumulative 替代。

累计范围包含零原点。该原点无日期、无圆点、无柱，也不进入记录数量；单日可从原点展示真实盈亏。缺失日期保留实际时间间隔，不插入零收益。

新 trend-view.tsx 使用公开声明支持的 SwiftUI Canvas 绘制动态线、淡面积、点、每日正负柱和最多3个实际日期标签；逐段三次曲线的控制点限制在真实端点值之间。正、负、零分别红、绿、灰。无 Canvas 的旧宿主回退原生 Chart / LineChart / AreaChart / BarChart，仍保留真实累计及每日正负，折线降级为最新一日对应的单色。

widget-view.tsx 中号使用左右栏，小号为独立纵向布局。EnvironmentValuesReader 读取系统明暗，同时传给文字和 Canvas；参数支持 system / light / dark / transparent，兼容旧 background 参数。透明不绘底板；普通模式保留内容层 regularMaterial、浅渐变和0.65点高光描边，宿主不提供模糊时仍有可读底板。不使用截图模拟系统折射，也不承诺桌面壁纸的系统级模糊。

原生材质与渐变已满足当前静态装饰需求，没有引入 PNG 或网络资源。应用提供两种尺寸的 Widget.preview，点击组件仍通过原脚本 URL 打开。API、扫码、续期、缓存读写及安装目录结构保持兼容。

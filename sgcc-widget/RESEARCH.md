# 可借用的信息与本次诊断

## 直接可用：空 common 的成功规则

用户提供的诊断为 `code: 0`、说明“成功”、`data.common: null`，且 `data.data` 是对象。它没有包含内层字段值。

官方 Android 3.2.3 安装包中的 `EleUtils.objectSuccess` 在 common 为空时继续检查外层状态，0 表示成功；`ObjectApiUtils.getData` 再取 `data.data`。所以1.5.1强制 common 非空是解析错误。1.5.2修复该条件，继续检查内层身份、确认状态与金额。

[官方安装包](https://osg-static.sgcc.com.cn/app/upgrade/wsgw_android.apk) · [包摘要及协议来源](../verification/sgcc-widget/payment-contract.json) · [观察记录](../verification/sgcc-widget/payment-null-common.json)

## 可以借鉴：交费户号清单与绑定列表分开

政府网站发布的[网上国网 App 缴费指引，第3页](https://www.xjtc.gov.cn/upload/main/contentmanage/article/file/2023/10/08/202310081155198392.pdf)说明，交费首页会同时展示登录账号绑定的户号和历史查询欠费信息的户号。它们与登录资料中的绑定列表不是同一个集合。

[微信小程序交费指引，第1至3页](https://www.xjtc.gov.cn/upload/main/contentmanage/article/file/2023/10/08/202310081155487816.pdf)说明，可使用网上国网账号通过手机号登录，未绑定时输入户号交费，也可以为其他户号交费、查看交费记录。该资料来自新疆地区、发布于2023年，支持入口能力的区别，不提供当前北京小程序的请求协议。

因此，用户在小程序看到未绑定的历史交费户号，不能用 App 登录响应中的 `powerUserList` 是否有该户号来判断能否查询。若需要从历史清单补全资料，应查询本账号的交费清单，精确匹配目标户号和地区，再使用返回的查询标识；不能把清单条目自动绑定到账号。

官方 SDK 的 `IService` 中确有交费列表与单户刷新方法：

| 方法 | 路径 | 已核对的用途 |
| --- | --- | --- |
| `queryEleListInfo` | `emss-eaa-payelec-front/member/p1/f01` | 多户交费列表流程，也被添加交费户号流程调用 |
| `queryEleListInfoSingle` | `emss-eaa-payelec-front/member/p1/f03` | 单户交费页面的列表流程，也存在输入/添加流程调用 |
| `queryEleInfoSingle` | `emss-eaa-payelec-front/member/p1/f04` | 现有单户金额刷新 |

仅有方法名和路径不足以确认列表请求的初始化参数或是否写入历史。1.5.2继续使用单户刷新，不新增列表/添加调用，不把添加流程作为自动回退。这次实际诊断已有成功外层，先修复本地误拒即可继续验证内层资料。

## 截图目前能说明什么

截图展示了 `csc-static.sgcc.com.cn:28888`、`csc-open.sgcc.com.cn:28086` 的连接，以及 `/mmtls/…` 路径。连接主机和端口没有给出国网查询的完整 HTTP 路径、业务请求体和响应字段，不能直接用作查询接口。

本次没有从截图拼接接口、切换网关或复用微信登录票据，也没有要求提供微信/国网凭证。扩展后的本地诊断只输出固定字段类型和核对分类，可以继续确认内层资料，不需要导出完整流量。

## 其他公开实现

查看了 [Yuheng0101/X 的网上国网脚本](https://github.com/Yuheng0101/X/tree/main/Tasks/95598)和 [dompling/Script 的国网重写配置](https://github.com/dompling/Script/blob/master/wsgw/wsgw.sgmodule)。前者提供账号查询与通知机制，未找到本次单户交费或微信小程序的实现；后者配置了自定义重写入口，不能据此认定它是官方未绑定户号查询 API。本次没有引入这些代码或将用户凭证交给中转服务。

## 验证边界

本轮依据实际响应形状与官方 SDK 修复解析，未取得用户内层数据，未登录或查询真实户号。小程序可查询是有效线索，不能据此假设其登录票据与 App 通道可以互换。金额是否完整返回，需更新后在手机核对。

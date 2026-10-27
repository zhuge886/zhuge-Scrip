# 1.5.1 查询错误处理与诊断

## 本次修复

1.5.0 先要求响应具有 SDK 成功结构，导致 `{code: 101001, message: "…"}` 这类没有 `data` 的错误丢失了原状态和说明。1.5.1 先识别外层错误、`data.srvrt` 网关错误及 `data.common` 业务错误，再验证成功金额结构。未知结构只提供诊断，不自动解释成金额。

两个匿名空参数请求的解密后错误见 [payment-gateway-errors.json](../verification/sgcc-widget/payment-gateway-errors.json)。没有使用真实户号、账号或登录凭证。它们是错误分支的实际样本，不是用户截图响应的抓包。

每次交费请求在本地保存一份固定字段类型与短状态码报告。设置页面提供“复制查询诊断”，不导出响应内容、动态字段名、请求或个人资料。诊断存储失败不影响查询。原始完整响应不会保存到脚本存储。

## 当前接入限制

进一步核对官方安装包发现 `ThreeAppConfigUtils.setPayLiteHelper` 向 SDK 传入 `host` 和 `newGate1`，后者在默认环境为 `https://csc-service.sgcc.com.cn:28002`；`RetrofitUtils` 也带有这个默认网关。单户刷新使用的 `La/d` 从 `SdkCoreHelper.getURL()` 取实际地址；原生初始化中的最终映射仍未完整核对。

`La/d$a.intercept` 还设置 SDK 的 `h`、`y`、`deviceInfo`、`sessionId` 和 `t` 请求头。现有代码仍通过原 App 的 `28630` 网关发出请求，未完整实现这些 SDK 会话初始化资料；本次没有猜测其值，也没有仅凭静态 URL 自动改端口重试。

因此，**单户刷新路径和金额字段有静态依据，完整的未绑定查询链路仍未验证成功**。手机诊断用于区分实际网关错误与数据层级问题，不应把离线成功样本当成真实权限或接入成功的证据。

## 原问题

1.4.0 使用 `emss-bia-balance-front/member/c16/f01`，即使传入正确的北京城区公司 `11401` 和地区 `11102`，仍可能收到“户号未绑定”。该余额接口与 App 的其他户号交费入口具有不同的请求和权限要求。新版本将这个错误明确限定到原余额接口，并提示切换查询入口。

## 交费模块的单户刷新

来源为[国网官方下载页](https://osg-static.sgcc.com.cn/app/download/index.html)提供的 [Android 安装包](https://osg-static.sgcc.com.cn/app/upgrade/wsgw_android.apk)。本轮实际下载版本是 **3.2.3**，SDK 版本 `1.2024.09.25.01`，包摘要和类/方法出处见 [来源记录](../verification/sgcc-widget/payment-contract.json)。仓库不包含 APK 或反编译源码。

在 `IService.queryEleInfoSingle` 和 `SingleElecIndexPresenter.refreshELeListItem` 中核对到：

```text
POST https://csc-service.sgcc.com.cn:28630/emss-eaa-payelec-front/member/p1/f04
```

通过现有 App 加密通道发出，应用层内容为：

```text
serviceCode: f05
source: "undefined"
target: "undefined"
data.common: SDK 公共头、当前登录 TOKEN、时间戳等
data.data:
  TYPE: "3"
  PROVINCE_CODE: 所选地区
  POWER_USER_ID: 用户输入的完整户号
  SENSITIVE_POWER_USER_ID: 本户上次成功返回的查询标识，首次为空
  TOKEN: 当前登录凭证
```

`source` 和 `target` 的字面字符串来自 SDK，不是漏填。该刷新形式没有 `orgNo`、`sceneType` 或 `ADD_TYPE`。只发送这一个单户查询，不把初次添加户号、付款、创建订单、绑定或删除接口作为自动回退。

SDK 还有首次输入户号相关流程，但其初始化和部分 App 桥接代码为原生实现。**目前没有验证刷新接口能否直接处理首次手输户号、是否必须先取得敏感查询标识，以及 App 登录 TOKEN 能否直接用于 SDK。** 请求结构的静态证据不足以证明这些条件已经满足。

## 响应和单位

交费保留解密后的完整 `ObjectApiResponse`，按 `EleUtils.objectSuccess` 使用的外层 `code = 0` 或业务码 `MCA00000` 判断；显式业务错误仍拒绝，不套用原余额接口的 `code = 1` 检查。登录过期最多重登一次，并同步重建请求体中的 TOKEN。交费业务层为 `data.common.repcd/repmsg` 与 `data.data` 单户资料。程序继续检查业务状态、验证/确认状态以及完整户号和地区；不递归寻找任意金额字段，不接受多户列表或掩码身份。

| SDK 条件 | 金额字段 | 单位 | 显示名称 |
| --- | --- | --- | --- |
| `POWER_USER_TYPE = 01` | `AVALIABLE_BALANCE`（SDK 原拼写） | 分，除以100一次 | 电费余额 |
| 北京 `11102`，上述类型且 `LOCAL_RCV_FLAG != 0` | 同上；`DEADLINE_TIME` 为截止时间 | 分 | 表内余额 |
| `POWER_USER_TYPE = 00` | `TOTAL_PAY_BREACH` | 分，除以100一次 | 应缴电费 |

以上对应 SDK 的 `PowerHelper.setMoney` 与 `MoneyUtil`。不拿 `BALANCE` 或 `OWE_AMT` 猜测替代。未知计费方式、空值、隐藏金额、非整数分金额均失败；真实零元保留。`PROMPT_STATUS` 不是成功状态 `0`，或存在 `IS_REAL_NAME_DISPLAY` 时，提示先在官方 App 完成确认/验证。

成功后只保留金额、金额类型、截止时间、经核对的户号/地区、供电公司及可选的本户查询标识。不保存姓名、住址或完整响应。报错中的长标识和数字户号被隐藏。

## 路由和缓存

- 手动户号＋自动入口：目标在登录账号绑定列表中则保留原余额/明细协议，否则用单户交费查询。
- 手动户号＋其他户号交费：明确使用单户交费查询。
- 手动户号＋原余额接口：保留旧的公司/类型有限尝试；收到未绑定不再轮试。
- 账号绑定户号：沿用原协议，最多前六户。

交费查询仅提供金额，不补查需要绑定权限的日/月明细。请求前后检查配置变化和取消，已停止请求的结果不写入缓存或成功组合。查询入口纳入缓存标识，1.5.0 更新标识版本使旧结果失效。

## 旧目录资料

北京15家公司编码仍来自官网公共地区目录，快照见 [beijing-directory.json](../verification/sgcc-widget/beijing-directory.json)。可在原余额兼容入口选择公司。目录查询证明公司编码来源，不能证明该户号可在原余额接口查询。

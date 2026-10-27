# 1.6.0 余额显示与查询协议

## 当前验证与显示

用户已确认1.5.2可以查询实际余额，成功诊断中户号/地区匹配，预付费与验证状态符合预期。无标识记录见 [user-confirmed-success.json](../verification/sgcc-widget/user-confirmed-success.json)。此确认限于该使用场景，不代表全部地区已实测。

1.6.0 的请求和缓存标识沿用1.5.2。交费入口只查询金额，不再因缺少日/月明细生成提示。显示层也过滤旧缓存里的这一条信息，真实业务与网络错误仍保留。缓存回退在卡片标记“缓存”，其他真实警告标记“提示”，避免把新数据误标为旧缓存。

日期优先取服务端截止日期，展示到日，不进行时区转换；有效截止日期缺失时标注查询更新时间。金额类型、分转元和身份校验规则不变。

## 空 common 的修复依据

用户提供的1.5.1诊断显示外层 `code` 为数字 `0`，说明“成功”，`data` 是对象，`data.common` 为 `null`，`data.data` 为对象。该诊断没有内层身份或金额值，不能把内层对象直接视为可用金额。

在官方 Android 3.2.3 的 `EleUtils.objectSuccess(ObjectApiResponse, boolean, Context)` 中，`getCommon()` 返回空时会继续检查外层状态，`code = 0` 返回成功；`-200/-201` 走会话过期。`ObjectApiUtils.getData` 再读取 `data.data`。

1.5.2 因此允许明确外层 `0` 搭配空/缺失的 `common`，继续进入单户资料校验。原先 `MCA00000` 的业务成功分支保留，显式业务或网关错误仍优先拒绝；非零或缺失外层状态不能仅凭 `common` 为空通过。类型错误的 `common` 也不视为缺失。

来源记录见 [payment-null-common.json](../verification/sgcc-widget/payment-null-common.json)。测试把用户观察到的外层结构与合成的有效/无效单户资料组合，不冒充真实金额响应。

## 诊断内容

报告保留固定字段的类型、短状态码，新增内层 `POWER_USER_ID`、`PROVINCE_CODE`、`POWER_USER_TYPE`、`PROMPT_STATUS`、金额字段等的类型。身份结果仅输出 `match/mismatch/missing/masked/invalid` 等分类，计费方式及确认状态也只输出固定分类，不记录对应字段值。

设置页面提供“复制查询诊断”。查询前清除旧报告，每次交费响应或异常生成报告；可选诊断存储失败不影响查询。完整响应、请求、姓名、住址、金额和登录信息不写入诊断。

## 小程序与历史户号

官方使用指引支持手机号登录后为未绑定户号交费，App 交费列表包含绑定与历史查询户号两类。它们不等于登录用户资料中的 `powerUserList`。SDK 也存在单独的交费列表查询；本次修复不新增调用，不把添加户号流程当作自动查询回退。具体来源与限制见 [研究记录](RESEARCH.md)。

截图仅展示连接主机/端口及传输路径，不能据此得出小程序的业务路径、请求体、登录票据或金额字段。当前响应已经有明确外层成功，不依据旧的匿名 `101001` 错误样本推断用户这次是网关故障，也不凭域名修改端口。

## 原问题

1.4.0 使用 `emss-bia-balance-front/member/c16/f01`，即使传入正确的北京城区公司 `11401` 和地区 `11102`，仍可能收到“户号未绑定”。该余额接口与 App 的其他户号交费入口具有不同的请求和权限要求。新版本将这个错误明确限定到原余额接口，并提示切换查询入口。

## 交费模块的单户刷新

来源为[国网官方下载页](https://osg-static.sgcc.com.cn/app/download/index.html)提供的 [Android 安装包](https://osg-static.sgcc.com.cn/app/upgrade/wsgw_android.apk)。本轮实际下载版本是 **3.2.3**，SDK 版本 `1.2024.09.25.01`，包摘要和类/方法出处见 [来源记录](../verification/sgcc-widget/payment-contract.json)。仓库不包含 APK 或反编译源码。

在 `IService.queryEleInfoSingle` 和 `SingleElecIndexPresenter.refreshELeListItem` 中核对到单户刷新相对路径；当前脚本通过既有 App 网关发送：

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

SDK 还有首次输入户号相关流程，但其初始化和部分 App 桥接代码为原生实现。用户已确认现有登录会话和单户刷新能够完成其未绑定户号的余额查询。其他账号首次查询、其他地区及需要额外验证的情况仍未全部实测。

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

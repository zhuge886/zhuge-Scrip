# Scripting 脚本存档

自用的 iPhone **Scripting** 脚本集合。每个功能使用独立目录，包含自己的项目清单、入口、依赖与使用说明，可单独远程导入。

当前收录 **电量监控**、**三角洲收益** 和 **网上国网·手动户号**，每个功能可独立导入。

## 功能目录

| 功能 | 版本 | 用途 | 远程导入 | 使用说明 |
| --- | --- | --- | --- | --- |
| 电量监控 | 1.1.1 | 中文电量界面、简洁桌面圆环与百分比、标准蓝牙配件按需读取 | [打开导入目录](https://github.com/zhuge886/zhuge-Scrip/tree/main/battery-widget) | [查看说明](battery-widget/README.md) |
| 三角洲收益 | 1.7.0 | 轻磨砂小中号布局、真实累计曲线与每日盈亏、明暗 / 透明主题 | [打开导入目录](https://github.com/zhuge886/zhuge-Scrip/tree/main/delta-force-widget) | [查看说明](delta-force-widget/README.md) |
| 网上国网·手动户号 | 1.5.0 | 新增其他户号交费金额查询，区分余额 / 表内余额 / 应缴；未绑定入口待真机验证 | [打开导入目录](https://github.com/zhuge886/zhuge-Scrip/tree/main/sgcc-widget) | [查看说明](sgcc-widget/README.md) |

## 远程导入链接（点击代码块右上角即可复制）

### 电量监控

```text
https://github.com/zhuge886/zhuge-Scrip/tree/main/battery-widget
```

在 **Scripting → 导入远程脚本** 中粘贴此链接，确认名称为 **电量监控**、版本为 **1.1.1**，导入后运行。

添加桌面小组件：**长按桌面 → 添加小组件 → Scripting → 编辑小组件 → 选择电量监控**。
如果桌面仍绑定旧的 Battery Monitor 项目，请在编辑菜单中改选新版“电量监控”。

电量监控的能力范围：

- 显示手机公开接口返回的电量百分比和充电状态；部分 iOS 版本可能对电量取整，桌面刷新另由系统调度。
- 支持按需读取提供标准电池服务的已连接蓝牙配件，需要 Scripting PRO。
- 可查询当前耳机音频输出名称；**目前不能读取 AirPods 左耳、右耳及充电盒的真实电量**，无法读取时显示 `--`。

[详细使用说明](battery-widget/README.md) · [验证记录与限制](battery-widget/VERIFICATION.md)

### 三角洲收益

```text
https://github.com/zhuge886/zhuge-Scrip/tree/main/delta-force-widget
```

在 **Scripting → 导入远程脚本** 中粘贴，确认名称 **三角洲收益**、版本 **1.7.0**。按最新效果图重做轻磨砂底板：小号纵向、中号左右分栏，真实累计曲线搭配每日红涨绿跌柱，大字保持最新单日收益。支持跟随系统、浅色、深色和透明主题；登录、续期及7天历史保留。62 项模拟检查通过，手机显示请用两种尺寸的原生预览确认。

[使用说明](delta-force-widget/README.md) · [接口分析](delta-force-widget/API.md) · [验证记录](delta-force-widget/VERIFICATION.md)

### 网上国网·手动户号

```text
https://github.com/zhuge886/zhuge-Scrip/tree/main/sgcc-widget
```

更新到 **1.5.0**，未绑定户号在自动模式下改用官方交费模块的单户金额查询，只填写户号和地区。区分余额、表内余额及应缴电费，不再把旧余额接口的“未绑定”解释为 App 无法查询。已通过类型检查及80项离线检查；**首次未绑定户号查询与登录凭证兼容性仍待 iPhone 实测**。

[使用说明](sgcc-widget/README.md) · [接口说明](sgcc-widget/API.md) · [验证记录](sgcc-widget/VERIFICATION.md)

## 仓库结构

```text
zhuge-Scrip/
├── README.md                         # 所有功能的目录与远程导入链接
├── battery-widget/                   # 电量监控：独立可导入的完整项目
│   ├── script.json                   # 名称、版本和说明
│   ├── index.tsx                     # 交互入口
│   ├── widget.tsx                    # 桌面小组件入口
│   ├── README.md                     # 本功能使用说明
│   └── …                             # 本功能自己的依赖模块
├── delta-force-widget/               # 三角洲收益：独立 Scripting 项目
│   ├── script.json                   # 项目名称、版本和说明
│   ├── index.tsx                     # 微信登录与交互入口
│   ├── widget.tsx                    # 最近日报收益 / 日期组件
│   └── README.md                     # 使用与授权说明
├── installers/
│   └── battery-widget.tsx            # 电量监控可选安装器
├── sgcc-widget/                      # 网上国网·手动户号：独立 Scripting 项目
│   ├── script.json                   # 版本 1.5.0，其他户号交费金额查询
│   ├── index.tsx                     # 登录、手动户号资料与查询结果
│   ├── widget.tsx                    # 余额与用电信息组件
│   └── README.md                     # 使用步骤与接口限制
└── verification/
    ├── battery-widget/               # 电量监控类型检查与回归检查
    ├── delta-force-widget/           # 三角洲收益类型检查与回归检查
    └── sgcc-widget/                  # 国网类型检查与离线模拟检查
```

## 后续添加新脚本

1. 为新功能建立独立目录，使用稳定的英文目录名；目录内包含 `script.json`、入口文件和全部运行依赖。
2. 在该目录的 `README.md` 写明用途、使用步骤和能力限制，并维护独立版本。
3. 在主页“功能目录”中添加一行，并在“远程导入链接”中添加可复制代码块。
4. 需要安装器或开发检查时，分别放入 `installers/<功能目录名>.tsx` 和 `verification/<功能目录名>/`。

正式导入链接统一使用 `main` 分支下的功能目录，避免把整个多功能仓库作为单个脚本导入。


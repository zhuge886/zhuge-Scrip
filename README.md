# Scripting 脚本存档

自用的 iPhone **Scripting** 脚本集合。每个功能使用独立目录，包含自己的项目清单、入口、依赖与使用说明，可单独远程导入。

当前收录 **电量监控**、**三角洲收益** 和 **网上国网·手动户号**，每个功能可独立导入。

## 功能目录

| 功能 | 版本 | 用途 | 远程导入 | 使用说明 |
| --- | --- | --- | --- | --- |
| 电量监控 | 1.1.1 | 中文电量界面、简洁桌面圆环与百分比、标准蓝牙配件按需读取 | [打开导入目录](https://github.com/zhuge886/zhuge-Scrip/tree/main/battery-widget) | [查看说明](battery-widget/README.md) |
| 三角洲收益 | 1.5.1 | 浅天蓝渐变组件、7天平滑曲线、最近收益与日期、微信自动续期 | [打开导入目录](https://github.com/zhuge886/zhuge-Scrip/tree/main/delta-force-widget) | [查看说明](delta-force-widget/README.md) |
| 网上国网·手动户号 | 1.2.0 | 地区/类型选择、五次以内自动尝试、供电单位选填、成功组合复用；真实查询待验证 | [打开导入目录](https://github.com/zhuge886/zhuge-Scrip/tree/main/sgcc-widget) | [查看说明](sgcc-widget/README.md) |

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

在 **Scripting → 导入远程脚本** 中粘贴，确认名称 **三角洲收益**、版本 **1.5.1**。小组件使用与主卡一致的浅天蓝渐变底，文字、收益和细曲线加深以保持清晰；透明模式继续可用。保留7天历史累计、登录和续期。52 项检查通过，原生外观仍需手机确认。

[使用说明](delta-force-widget/README.md) · [接口分析](delta-force-widget/API.md) · [验证记录](delta-force-widget/VERIFICATION.md)

### 网上国网·手动户号

```text
https://github.com/zhuge886/zhuge-Scrip/tree/main/sgcc-widget
```

更新到 **1.2.0**：输入户号、选择地区，类型默认自动尝试，也可选择住宅/店铺/电动车/企事业/新能源。供电单位改为可选高级设置，成功组合自动保存供小组件复用。仅在本户号和所选地区内最多尝试五种类型；验证码、限流、权限和网络错误立即停止。部分地区仍可能要求单位资料或绑定授权，**真实查询待验证**。

[使用说明](sgcc-widget/README.md) · [接口说明](sgcc-widget/API.md) · [验证状态](sgcc-widget/VERIFICATION.md)

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
│   ├── script.json                   # 版本 1.2.0，地区选择与有限自动尝试
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


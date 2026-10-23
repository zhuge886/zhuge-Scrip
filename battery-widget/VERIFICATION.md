# 电量监控 1.1.1 修复与验证记录

## 已从截图确认的问题

1. **Storage 导入错误**。截图明确记录 `scripting_1.Storage.get` 为 undefined。
   官方文档项目的 `store.ts` 使用全局 `Storage`；完整声明也将其放在 `global.d.ts`，
   而非 `scripting.d.ts` 的导出表。原入口在初始化时调用该错误引用会抛错，造成渲染中断。
2. **另外两个同类错误**：`BluetoothCentralManager`、`FileManager` 同样是宿主全局 API。
   原手写类型合同和测试都错误模拟为模块导出，漏检了这三处问题；本轮移除该合同并修正模拟。
3. **不是惰性初始化不受支持**：完整声明明确包含 `useState<T>(value: T | StateInitializer<T>)`。
   保留具体初始值与 effect 读取作为降级设计，不再将其列为已确认根因。
4. **错误堆栈占用小组件**：上一版把诊断文字附加到桌面，导致截图中的多行错误溢出。
   本轮桌面只显示电量；技术错误写入控制台，主界面显示中文摘要。
5. **布局、语言与状态问题**：圆环过小且空白过多；充电状态和设置为英文；设置没有触发桌面刷新；
   占位开关依赖扫描；未知电量的音频缓存过期后仍可能显示在线。

## API 和能力核对

- [官方 Storage 文档](https://scriptingapp.github.io/guide/Utilities/Storage)。
  同时对照官方文档包的 `store.ts`（原检查快照 `ScriptingApp/ScriptingApp.github.io@4ff6ea88fbbf853a25039b06e70aee090d1c62d3`）。
- [官方 BluetoothCentralManager 文档](https://scriptingapp.github.io/guide/Device%20Capabilities/Bluetooth/BluetoothCentralManager)。
  本项目查询已连接、支持标准电池服务的设备，不枚举系统原生电池组件的全部设备。
- [官方 SharedAudioSession](https://scriptingapp.github.io/guide/Changelog/3.1.0/SharedAudioSession)。
  `currentRoute` 提供当前输入/输出端口的名称和类型，不提供电量。
- [官方 HeadphoneMotionManager](https://scriptingapp.github.io/guide/Utilities/HeadphoneMotionManager)。
  接口提供运动数据，没有 AirPods 电量字段。本项目不会为此启动运动监听。
- [官方小组件快速入门](https://scriptingapp.github.io/guide/Widget/Widget%20Quick%20Start)、
  [Widget API](https://scriptingapp.github.io/guide/Widget/Widget%20API)、
  [widgetBackground](https://scriptingapp.github.io/guide/View%20Modifiers/widgetBackground)。

**AirPods 结论范围**：当前核对的 Scripting 接口没有直接读取左右耳和充电盒电量的 API。
系统能显示不等于第三方脚本能读取。音频输出查询仅能显示当前耳机名称和未知电量 `--`，
查询为空也不能据此断言耳机没连接。未把附近广播或说明占位误当成用户耳机的真实电量。

## 类型检查来源和限制

本轮移除 `verification/scripting.d.ts`（1.1.0 前的旧位置） 手写合同，改用公开保存的 Scripting 完整运行时声明：

- 来源：[Yii-An/Scripting-Scripts](https://github.com/Yii-An/Scripting-Scripts/tree/be3ea45b820b16c11fa7ce0b332b9b0e32ec5a3b/dts)。
- 固定提交：`be3ea45b820b16c11fa7ce0b332b9b0e32ec5a3b`。
- `global.d.ts` SHA-256：`f8b82ae67ef6e6f53abad2b66559403c9296a97eedd728d7fb473ac11a32a4b1`。
- `scripting.d.ts` SHA-256：`3fdcc4ef0ca032f569438645a79184ef7ee241e1812d517acfce8a4fd85e8905`。

`fetch-types.sh` 固定来源、校验哈希，并将声明下载到忽略的 `.runtime-types` 目录，未把大份第三方声明重新发布到本仓库。
它是**公开镜像，不是本次 iPhone 同步的声明**；关键全局用法还与官方示例和用户真机报错相互印证。
TypeScript 5.9.3 strict/noEmit 检查项目全部源码、两个入口、App Intent 与安装器；
`skipLibCheck` 仅跳过镜像声明内部检查，不跳过项目源码。
原代码在该检查下确实报出 Storage、BluetoothCentralManager、FileManager 的 TS2305 导出错误；修改后通过。

复现命令：

```sh
npm --prefix verification/battery-widget ci
npm --prefix verification/battery-widget run typecheck
npm --prefix verification/battery-widget test
```

## 开发环境已验证

56 项 JS/虚拟节点故障注入检查通过，包括：

- 最简界面与 stage=1..6 恢复流程，初始界面不启动蓝牙或耳机音频查询。
- **全局 API 回归**：模块没有导出 Storage/BluetoothCentralManager 时，使用全局接口仍可读写。
- Storage 读取抛错、缺失、写入 false、损坏设置/缓存，手机电量始终可独立显示。
- 设置保存后请求刷新；新一轮 widget 运行能读到保存的设置。
- 主动蓝牙读取、PRO 未授权、超时、无设备、读取失败、完整 128 位 UUID、重复设备、无效电量字节。
- 快速重复点击只执行一个读取任务；定时器完成后清理。
- 耳机查询仅在点击后执行；当前 AirPods 输出名称可缓存，电量始终保持未知，不影响手机电量。
- 占位即时开关、过期状态、重复 ID、隐藏离线、监听刷新与清理。
- 小/中/大尺寸与锁屏圆环的空间预算；只有真实数据填充圆环，空槽不显示伪造百分比。
- 小组件独立运行、模块/绘制失败降级、不显示技术堆栈；所有控件和状态使用中文。
- 安装器包含全部 18 个运行文件；先完整下载后写入，防止下载中断留下混合版本。
- `git diff --check` 通过。

这些检查不模拟 SwiftUI、蓝牙硬件或 WidgetKit 调度，不能据此宣称新版本已通过全部真机验收。

## 需要在 iPhone 复验

1. 从 `main/battery-widget` 远程导入，确认“电量监控” **1.1.1**；旧桌面小组件若仍指向 Battery Monitor，编辑后选择新版。
2. 应不再出现 `scripting_1.Storage.get`；修改“显示设备名称”等设置，关闭再运行后应保留。
3. 小尺寸显示四槽圆环，中尺寸四格横排；浅色/深色/着色/透明模式、系统大字体和名称开关无裁切。
4. 桌面不出现堆栈，点击小组件能进入本脚本；刷新由 iOS 安排，不能要求与状态栏始终同步。
5. 插拔电源确认“未充电 / 充电中 / 已充满”，退出界面后监听清理。
6. 戴上 AirPods 并播放音频，在控制中心选择耳机后点“检查耳机音频输出”，核对返回名称。
   主界面应说明电量不可读取，不能把 `--` 当成真实电量；若路由为空，应说明不代表未连接。
7. 支持标准电池服务的配件，分别检查蓝牙关闭、权限拒绝、无设备、成功读取与超时。
8. 用当前 iPhone 经 Scripting CLI 同步的官方声明，再核对该 App 版本的所有 API 签名。

仍保留最简与分阶段诊断入口：`scripting://run/电量监控?stage=0`（URL 使用时编码中文名称），
阶段 0 为中文化的官方最简 `Navigation.present + NavigationStack + VStack + Text` 结构；
1=Storage，2=Device，3=组合，4=圆环，5=监听，6=完整设置与操作。

## 1.1.1 归档整理与电量精度补充

- 运行项目仍独立放在 `battery-widget/`，正式导入使用 `main`。
- 可选安装器移动到 `installers/battery-widget.tsx`。
- 完整类型检查与回归检查移动到 `verification/battery-widget/`。
- 仓库主页提供功能目录与可复制链接，目前仅收录电量监控。
- 用户 55% / 状态栏 57% 的截图还可能涉及公开接口的取整精度，不能仅归因于缓存或 WidgetKit 延迟。
  [Apple 开发者论坛中的电量精度说明](https://developer.apple.com/forums/thread/732903)记录了部分 iOS 按 5% 档位返回的行为，
  Apple 工程师确认接口报告精度由系统决定。应用只能展示 API 返回值，不应人为补成状态栏读数。
- 研究资料中存在解析 AirPods 开盒广播的实验方法，但尚未验证当前 iPhone/Scripting 是否能收到所需报文、
  准确匹配用户耳机。此版本未加入该实验功能，也未宣称具备系统组件的左右耳/盒电量能力。

# 白屏修复与验证记录（1.0.1）

## 定位结论与证据边界

用户的 iPhone 已开通 Scripting PRO，不能据此把本次白屏归因于未订阅。
当前执行环境没有连接 iPhone/Scripting，**尚未复现原生白屏，也未确认唯一根因**。
源码中可确定的故障传播路径是：

- 原 `index.tsx` 在 `useState(() => ...)` 内进行 Storage/Device 同步读取，没有捕获；
  任一初始化读取抛错都会中断 Dashboard 渲染。现在使用具体初始值，在 effect 中分别读取。
  此改动也消除了对宿主支持 React 惰性初始化语义的依赖；不宣称已证明当前 App 不支持该语义。
- 原设置直接展开任意缓存，快照只校验数组；`null` 设备等损坏数据可令组合/渲染抛错。
- `index.tsx`/`widget.tsx` → `snapshot.ts` → `bluetooth.ts` 静态依赖 PRO API。
  这让基础界面和小组件也承受可选蓝牙模块的加载故障；现改为检查授权、用户操作后才加载蓝牙。
- 原入口只处理 `Navigation.present()` 成功，没有失败日志/错误界面。
  仅在 JSX 外包 try/catch 也捕获不到之后执行的子组件，所以纯 UI 子树在受保护位置构建。

仍沿用原 Dashboard、DeviceCell、圆环和 grid。Dashboard 移入 `dashboard.tsx`，
入口只负责最小展示、加载与降级。`widget.tsx` 单独加载数据/UI；可选模块导入、组合和 JS
渲染失败时展示本机电量文字及错误。无法读取的电量诚实显示 `--`，不造数据。
原生桥接错误是否会拒绝 `Navigation.present()`，仍须用实际 App 验证；JS 捕获不能保证拦截原生崩溃。

## 官方依据

- [最简展示](https://scriptingapp.github.io/guide/Views/Present%20views/Present%20a%20simple%20view/)：`Navigation.present`、`NavigationStack`、`VStack`、`Text`。
- [Hooks 用法](https://scriptingapp.github.io/guide/Quick%20Start)：具体初始值、effect、清理。
- [Script API](https://scriptingapp.github.io/guide/Script/Script)：`Script.hasFullAccess(): boolean`。
- [蓝牙 Central（PRO）](https://scriptingapp.github.io/guide/Device%20Capabilities/Bluetooth/BluetoothCentralManager)。
- [Storage](https://scriptingapp.github.io/guide/Utilities/Storage)：同步 get，set 返回成功与否。
- [Shapes](https://scriptingapp.github.io/guide/Views/Shapes/) 和 [Color](https://scriptingapp.github.io/guide/Types/Color)：核对 trim/stroke/颜色；使用 ShapeStyle/DynamicShapeStyle 类型。
- [小组件](https://scriptingapp.github.io/guide/Widget/Quick%20Start)：独立 `widget.tsx`，不使用 hooks，不扫描，`Widget.present` 前准备数据。

同时对照官方仓库 `ScriptingApp/ScriptingApp.github.io` 中的
`scripting/App Store/Scripting Documentation.zip`（读取时 main 为 `4ff6ea88fbbf853a25039b06e70aee090d1c62d3`）。

## 已在开发环境执行

从仓库根目录运行：

```sh
npm --prefix verification ci
npm --prefix verification run typecheck
npm --prefix verification test
```

- TypeScript 5.9.3 strict/noEmit：两个入口、全部依赖、安装器通过。
- 类型环境是 `verification/scripting.d.ts` 的**官方文档衍生、有限 API 合同**，明确检查所用属性、
  回调与数据类型，未用任意属性索引/全局 any 放行组件。它不是 App 同步的官方完整 `.d.ts`；
  必须再用 iPhone 当前版本内置检查或 CLI 同步声明验证版本兼容性。
- Node 故障注入：32 项通过，先最简界面、再逐阶段恢复 Storage、Device、组合、DeviceCell、监听、全部控件。
- 覆盖 Storage 读取抛错/写入返回 false、畸形快照/设置、独立电池 getter 失败、NaN/-1、监听失败及清理。
- 覆盖 PRO 未授权/检查抛错：禁用扫描，保留手机电量。用户已有 PRO 的路径也检查。
- 覆盖蓝牙模块导入失败、读取拒绝、无设备、标准服务返回 88%：只有用户点击才加载/读取；本机电量持续显示。
- 覆盖 Dashboard 导入失败、数据组合/DeviceCell/grid 抛错、手机监听更新、widget 独立启动。
- 校验安装器 FILES 包含所有运行时模块；版本升级至 1.0.1。

这些是 JavaScript 控制流、虚拟节点与静态检查，**不是 SwiftUI 渲染或真实蓝牙测试**。

## iPhone 分阶段复验（待执行）

可通过 URL `scripting://run/Battery%20Monitor?stage=0` 或脚本运行参数传入 `stage`。
若本机项目名称不同，请替换 URL 中的名称。没有参数时默认为完整的阶段 6。

| 阶段 | 新增能力 | 应观察到 |
| --- | --- | --- |
| 0 | 官方最简 `Navigation.present + NavigationStack + VStack + Text`，无 hooks/本地运行时模块 | `Hello Scripting!` |
| 1 | Storage + 具体初始状态 | 列表和设置/快照读取；电量暂为 `--` |
| 2 | Device | iPhone 当前百分比与充电状态 |
| 3 | 数据组合 | 本机 + 有效缓存，不可被坏缓存遮住本机 |
| 4 | DeviceCell/圆环 | 原有圆环预览 |
| 5 | 电池监听 | 插拔电源后状态变化，退出后移除监听 |
| 6 | 全部设置/按钮、PRO 检查 | 完整界面；启动无蓝牙访问，点击扫描才执行 |

最先失败的阶段和控制台 `[Battery Monitor]` 日志，才是确认该手机实际根因的依据。
还需验证：当前 App 官方类型检查、远程更新完整性、浅/深色原生渲染、关闭蓝牙/拒绝权限、
真实 0x180F/0x2A19 设备、桌面小/中尺寸实际显示与 WidgetKit 刷新。

## 在 iPhone 桌面显示

1. 用更新后的仓库根目录 `install.tsx` 执行 **Install / Update**，应成功下载全部 15 个文件。
   合并前测试修复分支时，将安装器 `BRANCH` 改为 `fix/battery-monitor-startup-20261023`；合并后使用默认 `main`。
2. 打开 Battery Monitor，确认本机电量和状态；可点 **Preview widget (medium)** 预览。
3. 长按 iPhone 桌面空白处 → 添加小组件 → **Scripting** → 选择尺寸并添加。
4. 长按该小组件 → 编辑小组件 → 选择 **Battery Monitor**。

iOS 需要用户手动添加到桌面，脚本不能自动摆放小组件。桌面刷新由 WidgetKit 调度，
本脚本请求约 15 分钟后刷新；这不是实时更新保证。无需扫描即可显示手机电量。

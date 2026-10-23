# 多设备电量监控小组件（Scripting / iOS）

基于 iOS **Scripting App**（TypeScript / TSX）实现的桌面小组件。无需独立 App、无需 Apple
Developer 付费账户。所有 API 均来自 Scripting 官方文档（本仓库代码已用官方文档逐项核对，
并通过 `tsc` 做过类型/语法检查）。

> 核心原则：**只展示真实可读取的数据，读不到就显示 `--`，绝不编造电量。**

---

## 第一阶段：API 可行性验证结论（最重要）

| 能力 | 结论 | 依据 / 使用的真实 API |
| --- | --- | --- |
| iPhone 本机电量 % | ✅ **支持** | `Device.batteryLevel`（0.0–1.0） |
| iPhone 充电状态（充电/未充/已充满） | ✅ **支持** | `Device.batteryState` = `charging`/`unplugged`/`full`/`unknown` |
| 电量变化监听（交互页面内实时更新） | ✅ **支持** | `Device.addBatteryLevelListener` / `addBatteryStateListener` |
| 小组件渲染 | ✅ **支持** | `Widget.present()`、`Widget.family`、`Widget.displaySize` |
| 小组件刷新 | ✅ **支持（非实时）** | `WidgetReloadPolicy`（`atEnd` / `after`）、`Widget.reloadAll()`；刷新时机由 iOS 决定 |
| 标准 BLE 设备电量（手环/部分鼠标键盘/部分 BLE 耳机等） | ⚠️ **有限支持** | Core Bluetooth：`BluetoothCentralManager.retrieveConnectedPeripherals(["180F"])` → `connect` → `discoverServices/Characteristics` → `readValue`（标准电池服务 `0x180F` / 电量特征 `0x2A19`）。**仅能在交互页面/App Intent 中执行，真机验证。** |
| **AirPods 左/右/充电盒电量** | ❌ **不支持** | iOS **未向第三方提供任何公开 API**。AirPods 走 Apple 私有协议，不以标准 GATT 电池服务暴露；系统原生电量小组件用的是私有框架。Scripting 的蓝牙 API 是标准 BLE central，**读不到**。 |
| 经典蓝牙（非 BLE）音频设备电量 | ❌ **不支持** | Core Bluetooth 只枚举 BLE 外设，经典蓝牙设备根本不出现。 |

### 关键结论（对应需求中的「特别要求」）

1. **系统原生电池小组件 ≠ Scripting 可访问的数据。** 原生小组件读取 AirPods / 配件电量依赖
   iOS 私有框架；第三方脚本（含 Scripting、Scriptable、快捷指令）都**无法**访问这些数据。
2. 因此本项目**没有**编写大量「假装能读 AirPods」的蓝牙代码。AirPods 一栏固定显示 `--`，
   并在交互页内注明原因。
3. **可行的替代实现**（已内置）：
   - iPhone 电量：小组件内**实时真实读取**。
   - 标准 BLE 电池服务设备：在交互 App / App Intent 中**按需读取**，把结果缓存到
     `Storage`，小组件读取缓存展示（小组件生命周期极短，无法自行扫描蓝牙）。
   - 无法读取的设备：如实显示 `--` / 离线，不伪造。

---

## 小组件为何不能自己扫蓝牙？（官方文档约束）

Scripting 官方文档明确：小组件 **只渲染一次**、hooks 不生效、约 **30MB** 内存上限、
`Widget.present()` 之后上下文立即销毁。因此必须在 `present()` 之前准备好数据，**不能**在
小组件里做异步 BLE 扫描/连接。方案是「交互侧扫描 + 缓存，组件侧读缓存」。

---

## 架构与文件说明（模块化，便于扩展 Watch / iPad）

```
battery-widget/
├─ script.json       # 项目清单（名称/图标/颜色/描述）
├─ model.ts          # 纯数据模型与常量（可被任何环境安全 import）
├─ store.ts          # Storage 读写（设置、缓存快照）
├─ battery.ts        # iPhone 本机电量读取（Device API，100% 真实）
├─ bluetooth.ts      # 标准 BLE 电池服务读取（0x180F/0x2A19，有限支持）
├─ snapshot.ts       # 组合非本机设备快照 + 组件最终列表排序/降级
├─ theme.ts          # 颜色（浅/深色自适应）与电量阈值→配色
├─ ui.tsx            # 圆环 BatteryRing、设备单元 DeviceCell
├─ grid.tsx          # 2×2 宫格布局（组件与预览共用）
├─ widget.tsx        # 小组件入口（本机实时 + 读缓存，渲染一次）
├─ app_intents.tsx   # RefreshBatteryIntent（扫描+缓存+刷新组件）
└─ index.tsx         # 交互 App：仪表盘、扫描刷新、设置、预览、能力说明
```

**扩展新设备类型**：在 `model.ts` 的 `DeviceKind` 增加类型，在 `snapshot.ts` 增加一个
返回 `BatteryItem[]` 的 provider，并加入 `buildSnapshotItems()` 即可；UI/组件无需改动。
Apple Watch / iPad 若未来出现可用的第三方读取 API，可在此处接入；当前 iOS 无公开 API，
因此不内置其电量读取，避免伪造。

### UI 设计落地

- 2×2 四宫格，每个设备一个**圆环**（`Circle` + `trim` 绘制进度，`lineCap:"round"`）。
- 圆环中央：设备 SF Symbol 图标 + 电量百分比；充电时叠加 `bolt.fill` 闪电。
- 配色：充足=绿、中等=黄、低电量=红、充电=绿（阈值可在设置里调整）。
- 浅色/深色：文字与背景用 `DynamicShapeStyle`（`{ light, dark }`）自动适配。
- `widgetBackground` 处理 iOS 18 着色（tinted）模式，避免背景被强制涂白。
- 读不到电量时圆环不填充且显示 `--`（不画假进度）。

---

## 导入到 Scripting App 的方式

因为 Scripting 的脚本/文件存放在 App 的私有沙盒里，推荐在手机上操作：

1. 打开 **Scripting** App → 新建一个 Script 项目，命名如 `Battery Monitor`。
2. 新建项目会自动生成 `index.tsx`（以及 `script.json`）。把本仓库 `battery-widget/`
   里的每个文件内容，逐个在项目中新建同名文件并粘贴：
   `model.ts`、`store.ts`、`battery.ts`、`bluetooth.ts`、`snapshot.ts`、`theme.ts`、
   `ui.tsx`、`grid.tsx`、`widget.tsx`、`app_intents.tsx`，并覆盖 `index.tsx`、`script.json`。
   - 文件名必须完全一致（尤其入口文件 `index.tsx` / `widget.tsx` / `app_intents.tsx`）。
   - 相对 import（如 `./model`）要求这些文件在**同一项目**里。
3. 若用 iCloud/文件 App 同步：把整个 `battery-widget` 文件夹放入 Scripting 可访问的目录，
   再在 App 内按项目方式打开/导入（不同版本入口略有差异，以 App 实际为准）。

## 配置步骤

1. 在 Scripting 中运行该项目（打开 `index.tsx` 交互界面）。
2. 点 **Scan & refresh now**：
   - 首次会弹出系统**蓝牙权限**请求，请允许（否则 BLE 设备读不到）。
   - 会读取已连接且支持标准电池服务的 BLE 设备，写入缓存并刷新组件。
3. 在 **Settings** 里按需调整：
   - `Read BLE battery devices`：是否尝试读取 BLE 设备。
   - `Show AirPods info cell`：是否显示 AirPods 说明格（恒为 `--`）。
   - `Hide offline devices`：断开设备是隐藏还是显示为离线。
   - `Max items`：最多展示项（≤4）。
   - `Stale after`：缓存多少分钟后视为过期（过期显示 `--`，不展示旧值）。
4. 回到桌面，长按空白 → 添加 **Scripting** 小组件 → 长按组件 → **Edit Widget** →
   选择本脚本（建议中尺寸 systemMedium）。
5. （可选）想在组件上放一个刷新按钮：在 `widget.tsx` 的布局里加入
   `<Button title="⟳" intent={RefreshBatteryIntent(undefined)} />`（需从 `./app_intents`
   导入）。也可用 iOS「快捷指令」定时运行该脚本/Intent 来周期性刷新缓存。

## 测试方法

- **类型/语法检查**：本代码已通过 `tsc`（严格模式）结构检查。真机上以 Scripting 自带
  类型为准，在 App 内保存即做类型检查。
- **iPhone 电量（可立即验证）**：交互页 **Status** 行显示实时百分比与充电状态；插拔充电线，
  数值/颜色/闪电应随之变化（交互页通过监听实时更新；组件按刷新策略更新）。
- **BLE 设备（需真机）**：连接一个支持标准电池服务的 BLE 设备（如某些心率带/手环/BLE 键鼠），
  点 Scan；能读到则显示百分比，读不到显示 `--` 并标注原因。
- **组件预览**：交互页 **Preview widget (medium)** 调用 `Widget.preview()` 预览布局
  （官方说明预览仅为近似，最终以桌面为准）。
- **降级/异常**：关闭蓝牙或不授予权限 → 不崩溃，相关设备显示 `--`；缓存过期 → 显示 `--`。

## 需真机验证的项（开发环境无法替代）

- 模拟器通常返回 `Device.batteryLevel = -1`（代码已按「未知 → `--`」处理）。
- 具体某个 BLE 设备是否真的暴露 `0x180F/0x2A19` 且允许第三方 central 读取（很多音频设备被系统独占，读不到属正常）。
- 小组件在桌面的真实刷新频率（由 iOS/WidgetKit 调度，分钟级，不保证实时）。
- SF Symbol 图标名在当前 iOS 版本是否存在（缺失时系统会以占位符显示，可替换为通用图标）。

## 已知限制与诚实声明

- **AirPods / 经典蓝牙音频电量：第三方脚本无法读取**，这是 iOS 平台限制而非本项目缺陷。
  本项目不使用任何模拟数据冒充真实电量。
- BLE 读取受权限、设备是否可被第三方连接、是否实现标准电池服务等影响，属「有限支持」。
- 若只需要 100% 稳定可用的部分，可在设置中关闭 BLE、关闭 AirPods 说明格，得到一个纯
  iPhone 电量的、长期稳定低功耗的小组件。

官方文档：https://scriptingapp.github.io/

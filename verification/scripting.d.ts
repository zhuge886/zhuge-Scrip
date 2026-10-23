// Deliberately limited, documentation-derived contract for this project's APIs.
// NOT a replacement for the .d.ts synchronized by the user's Scripting app.
// Sources and exact scope are recorded in VERIFICATION.md.
declare module "scripting" {
  export type ShapeStyle = "systemGreen" | "systemYellow" | "systemRed" | "systemGray" | "systemGray5" | "black" | "white" | "secondaryLabel" | "systemBackground" | "secondarySystemBackground"
  export type DynamicShapeStyle = { light: ShapeStyle; dark: ShapeStyle }
  export interface VirtualNode { type: unknown; props: unknown }
  type Children = VirtualNode | string | number | null | undefined | Children[]
  interface ViewProps {
    key?: string | number; children?: Children; padding?: boolean | number;
    frame?: { width?: number; height?: number; maxWidth?: "infinity"; maxHeight?: "infinity" };
    foregroundStyle?: ShapeStyle | DynamicShapeStyle;
    background?: ShapeStyle | DynamicShapeStyle; widgetBackground?: ShapeStyle | DynamicShapeStyle;
    navigationTitle?: string; toolbar?: { cancellationAction?: VirtualNode };
    spacing?: number; alignment?: "center" | "leading"; opacity?: number;
    font?: "caption" | "footnote"; fontWeight?: "bold";
    lineLimit?: number; minScaleFactor?: number; rotationEffect?: number; disabled?: boolean;
  }
  type View = (props: ViewProps) => VirtualNode
  export const VStack: View, HStack: View, ZStack: View, NavigationStack: View, List: View, Spacer: View, Text: View
  export function Section(props: ViewProps & { header?: VirtualNode; footer?: VirtualNode }): VirtualNode
  export function Button(props: ViewProps & { title: string; action: () => void | Promise<void> }): VirtualNode
  export function Toggle(props: ViewProps & { title: string; value: boolean; onChanged: (v: boolean) => void }): VirtualNode
  export function Stepper(props: ViewProps & { title: string; onIncrement: () => void; onDecrement: () => void }): VirtualNode
  export function Image(props: ViewProps & { systemName: string; resizable?: boolean; scaleToFit?: boolean }): VirtualNode
  export function Circle(props: ViewProps & { trim?: { from: number; to: number }; stroke?: ShapeStyle | DynamicShapeStyle | { shapeStyle: ShapeStyle | DynamicShapeStyle; strokeStyle: { lineWidth?: number; lineCap?: "round" } } }): VirtualNode
  // Concrete initializer contract intentionally rejects reliance on lazy initializers.
  export function useState<T>(value: T): [T, (value: T | ((previous: T) => T)) => void]
  export function useEffect(effect: () => void | (() => void), deps: unknown[]): void
  export namespace Navigation { function useDismiss(): () => void; function present(options: { element: VirtualNode }): Promise<void> }
  export namespace Script { const queryParameters: Record<string, unknown>; function hasFullAccess(): boolean; function exit(): void }
  export namespace Device {
    const batteryLevel: number; const batteryState: "full" | "charging" | "unplugged" | "unknown"; const isiPad: boolean;
    function addBatteryLevelListener(cb: (value: number) => void): void;
    function removeBatteryLevelListener(cb?: (value: number) => void): void;
    function addBatteryStateListener(cb: (value: string) => void): void;
    function removeBatteryStateListener(cb?: (value: string) => void): void;
  }
  export namespace Storage { function get<T>(key: string): T | null; function set<T>(key: string, value: T): boolean }
  export namespace Widget {
    const family: string;
    function present(node: VirtualNode, policy?: { policy: "after"; date: Date }): void;
    function preview(options: { family: "systemMedium" }): Promise<void>;
    function reloadAll(): void;
  }
  export interface BluetoothPeripheral {
    id: string; name: string | null; services: BluetoothService[] | null;
    discoverServices(uuids: string[]): Promise<void>;
    discoverCharacteristics(service: BluetoothService, uuids: string[]): Promise<void>;
    readValue(char: BluetoothCharacteristic): Promise<{ toIntArray(): number[] }>;
  }
  export interface BluetoothService { uuid: string; characteristics: BluetoothCharacteristic[] | null }
  export interface BluetoothCharacteristic { uuid: string; properties: string[] }
  export namespace BluetoothCentralManager {
    function retrieveConnectedPeripherals(uuids: string[]): Promise<BluetoothPeripheral[]>;
    function connect(peripheral: BluetoothPeripheral): Promise<void>;
    function disconnect(peripheral: BluetoothPeripheral): Promise<void>;
  }
  export function fetch(url: string): Promise<{ ok: boolean; status: number; text(): Promise<string> }>
  export namespace FileManager {
    const scriptsDirectory: string;
    function existsSync(path: string): boolean;
    function createDirectorySync(path: string, recursive?: boolean): void;
    function writeAsStringSync(path: string, content: string): void;
  }
  export const AppIntentProtocol: { AppIntent: string }
  export namespace AppIntentManager { function register<T>(options: { name: string; protocol: string; perform: () => Promise<void> }): (arg: T) => unknown }
}
declare namespace JSX {
  interface Element { type: unknown; props: unknown }
  interface ElementChildrenAttribute { children: {} }
  interface IntrinsicAttributes { key?: string | number }
}

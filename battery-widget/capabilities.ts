import { Script } from "scripting"
import { attempt } from "./diagnostics"

// Never infer entitlement from Bluetooth availability or trigger a permission prompt.
export function canReadBle(): boolean {
  return attempt("PRO 授权检测", () =>
    typeof Script.hasFullAccess === "function" && Script.hasFullAccess(), false)
}
export { BLE_UNAVAILABLE } from "./copy"

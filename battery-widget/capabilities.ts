import { Script } from "scripting"
import { attempt } from "./diagnostics"

// Never infer entitlement from Bluetooth availability or trigger a permission prompt.
export function canReadBle(): boolean {
  return attempt("Scripting PRO check", () =>
    typeof Script.hasFullAccess === "function" && Script.hasFullAccess(), false)
}
export const BLE_UNAVAILABLE = "BLE requires Scripting PRO. Scanning is disabled; iPhone battery remains available."

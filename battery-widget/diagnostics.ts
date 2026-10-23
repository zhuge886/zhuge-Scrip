// Shared diagnostics: no native API access at module evaluation time.
const messages: string[] = []
export function report(scope: string, error: unknown): string {
  const message = `${scope}: ${String(error)}`
  console.error(`[Battery Monitor] ${message}`)
  if (!messages.includes(message)) messages.push(message)
  return message
}
export function diagnosticText(): string { return messages.join("\n") }
export function attempt<T>(scope: string, read: () => T, fallback: T): T {
  try { return read() } catch (error) { report(scope, error); return fallback }
}

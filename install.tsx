// ===========================================================================
// One-tap installer for the "Battery Monitor" Scripting project.
//
// HOW TO USE (on iPhone):
//   1. In the Scripting app, create a NEW script project (any name, e.g.
//      "Install Battery Monitor").
//   2. Replace its index.tsx with THIS file's contents.
//   3. Edit the three constants below (OWNER / REPO / BRANCH) to match your
//      GitHub repository.
//   4. Run it, tap "Install / Update", then fully quit & reopen Scripting.
//      A new project named "Battery Monitor" will appear, ready to add as a
//      widget.
//
// It fetches the raw files from your PUBLIC GitHub repo (no token / no PRO
// needed) and writes them into the app's scripts directory.
// For a PRIVATE repo, use the GitHub API (Settings → GitHub token) instead.
// ===========================================================================
import {
  fetch, FileManager, Navigation, NavigationStack, List, Section,
  Button, Text, VStack, Script, useState,
} from "scripting"

// ---- EDIT THESE THREE LINES ----
const OWNER = "zhuge886"
const REPO = "zhuge-Scrip"
const BRANCH = "main"
// --------------------------------

// Folder inside the repo that holds the project files ("" if at repo root).
const SUBDIR = "battery-widget"
// Target project name created on-device.
const PROJECT = "Battery Monitor"

const FILES = [
  "script.json", "model.ts", "store.ts", "battery.ts", "bluetooth.ts",
  "snapshot.ts", "theme.ts", "ui.tsx", "grid.tsx", "widget.tsx",
  "app_intents.tsx", "diagnostics.ts", "capabilities.ts", "dashboard.tsx", "index.tsx",
]

function rawUrl(file: string): string {
  const p = SUBDIR ? `${SUBDIR}/${file}` : file
  return `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${p}`
}

function Installer() {
  const dismiss = Navigation.useDismiss()
  const [log, setLog] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const add = (line: string) => setLog(prev => [...prev, line])

  const install = async () => {
    if (busy) return
    setBusy(true)
    setLog([])
    try {
      if (OWNER.trim() === "YOUR_GITHUB_USERNAME") {
        add("⚠️ Edit OWNER/REPO/BRANCH at the top of this script first.")
        setBusy(false)
        return
      }
      const dest = `${FileManager.scriptsDirectory}/${PROJECT}`
      if (!FileManager.existsSync(dest)) {
        FileManager.createDirectorySync(dest, true)
      }
      add(`Installing into: ${PROJECT}`)
      let ok = 0
      for (const file of FILES) {
        const url = rawUrl(file)
        try {
          const res = await fetch(url)
          if (!res.ok) {
            add(`✗ ${file} (HTTP ${res.status})`)
            continue
          }
          const text = await res.text()
          FileManager.writeAsStringSync(`${dest}/${file}`, text)
          ok++
          add(`✓ ${file}`)
        } catch (e) {
          add(`✗ ${file} (${String(e)})`)
        }
      }
      add(`Done: ${ok}/${FILES.length} files.`)
      add("Now FULLY quit & reopen Scripting to see the project.")
    } catch (e) {
      add("Failed: " + String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <NavigationStack>
      <List
        navigationTitle="Install Battery Monitor"
        toolbar={{ cancellationAction: <Button title="Done" action={dismiss} /> }}
      >
        <Section
          header={<Text>Source</Text>}
          footer={<Text>{`${OWNER}/${REPO}@${BRANCH}`}</Text>}
        >
          <Button
            title={busy ? "Installing…" : "Install / Update"}
            action={install}
          />
        </Section>
        <Section header={<Text>Log</Text>}>
          <VStack alignment="leading" spacing={3} padding={6}>
            {log.length === 0 ? (
              <Text foregroundStyle="secondaryLabel" font="footnote">
                Tap Install / Update to begin.
              </Text>
            ) : (
              log.map((l, i) => (
                <Text key={i} font="footnote">{l}</Text>
              ))
            )}
          </VStack>
        </Section>
      </List>
    </NavigationStack>
  )
}

Navigation.present({ element: <Installer /> }).then(() => Script.exit())

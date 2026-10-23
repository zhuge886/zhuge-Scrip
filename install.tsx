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
  fetch, Navigation, NavigationStack, List, Section,
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
const PROJECT = "电量监控"

const FILES = [
  "script.json", "model.ts", "store.ts", "battery.ts", "bluetooth.ts",
  "snapshot.ts", "theme.ts", "ui.tsx", "grid.tsx", "widget.tsx",
  "app_intents.tsx", "copy.ts", "async.ts", "audio.ts", "diagnostics.ts", "capabilities.ts", "dashboard.tsx", "index.tsx",
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
        add("请先填写脚本顶部的仓库信息。")
        setBusy(false)
        return
      }
      // 完整下载并校验清单后才写入，避免网络中断留下混合版本。
      const downloaded: { file: string; content: string }[] = []
      for (const file of FILES) {
        const response = await fetch(rawUrl(file))
        if (!response.ok) throw new Error(`${file} 下载失败（HTTP ${response.status}）`)
        downloaded.push({ file, content: await response.text() })
        add(`已下载 ${downloaded.length}/${FILES.length}：${file}`)
      }
      const manifest = downloaded.find(entry => entry.file === "script.json")!
      JSON.parse(manifest.content)
      const dest = `${FileManager.scriptsDirectory}/${PROJECT}`
      if (!FileManager.existsSync(dest)) FileManager.createDirectorySync(dest, true)
      let ok = 0
      for (const entry of downloaded.filter(e => e.file !== "script.json").concat([manifest])) {
        FileManager.writeAsStringSync(`${dest}/${entry.file}`, entry.content)
        ok++
      }
      add(`已完成：${ok}/${FILES.length} 个文件。`)
      add("请重新打开 Scripting，选择“电量监控”运行。")
    } catch (e) {
      console.error("[电量监控] 安装失败", e)
      add("安装失败，请检查网络或控制台后重试。")
    } finally {
      setBusy(false)
    }
  }

  return (
    <NavigationStack>
      <List
        navigationTitle="安装电量监控"
        toolbar={{ cancellationAction: <Button title="完成" action={dismiss} /> }}
      >
        <Section
          header={<Text>安装来源</Text>}
          footer={<Text>{`${OWNER}/${REPO}@${BRANCH}`}</Text>}
        >
          <Button
            title={busy ? "正在安装…" : "安装或更新"}
            action={install}
            disabled={busy}
          />
        </Section>
        <Section header={<Text>安装记录</Text>}>
          <VStack alignment="leading" spacing={3} padding={6}>
            {log.length === 0 ? (
              <Text foregroundStyle="secondaryLabel" font="footnote">
                点击“安装或更新”开始。
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

# speckit-launch

[English](README.md) | 繁體中文

一條指令啟動 [GitHub Spec Kit](https://github.com/github/spec-kit) 專案：裝上主流 AI agent 整合，並共用一份 canonical `.agents/skills`。

適用 **Windows、macOS、Linux**。不綁定單一 coding agent 或作業系統。

## 為什麼需要這個啟動器

官方 init 一次只裝 **一個** agent：

```bash
specify init <name> --integration copilot --script sh --non-interactive
```

這個啟動器一次裝上主流組合，把 `speckit-*` skills 收斂到 `.agents/skills`，建立 junction／符號連結，更新 `.gitignore`，並疊上 **串接 Spec Kit 流程**（clarify／analyze 是必跑步驟；只有這兩步仍有問題才停下來）。

## 前置需求

- [Node.js](https://nodejs.org/)（18+）
- [`specify`](https://github.com/github/spec-kit) 在 `PATH` 上，或已安裝 [`uv`](https://docs.astral.sh/uv/)（必要時 CLI 會用 `uv tool install specify-cli` 補上）
- `git`（除非加 `--no-git`）

### Spec Kit 相容性

啟動器使用 `PATH` 上的 `specify`。它 **不會** 把 Spec Kit skills 打進這個套件，也不在 `package.json` pin CLI。

這個 repo 與產生的專案一律用 **LF**（`.gitattributes`：`* text=auto eol=lf`），避免 Windows `core.autocrlf` 把 diff 拆散或弄壞 shebang。

| | 版本 |
|--|------|
| **最低需求** | Spec Kit **1.0+**（`specify workflow overlay`、overlay 路徑 `.specify/workflows/overlays/`） |
| **最近實測** | **1.0.4**（2026-09-08） |

串接 SDD overlay 對準官方 bundled `speckit` workflow 的 step id（`specify`、`review-spec`、`plan`、`review-plan`、`tasks`、`implement`）。新版 CLI 若改名這些 id，要改 overlay——見 [升級 `specify` CLI 之後](#升級-specify-cli-之後)。

## 快速開始

```bash
git clone https://github.com/timoyan/speckit-launch.git
node speckit-launch/bin/new-project.mjs my-app

# 在目前目錄初始化
node speckit-launch/bin/new-project.mjs --here

# 自訂上層目錄與 script 類型
node speckit-launch/bin/new-project.mjs my-app --dir ~/projects --script sh
```

預設安裝這些 Spec Kit 整合：

`copilot`、`claude`、`cursor-agent`、`gemini`、`grok`、`codex`

不必加 `--ai`。只有在只要單一 agent 時才用 `--only <integration>`。

### 本地連結與全域使用 (`npm link`)

如果你 clone 了此 repo，想在系統任何路徑直接使用 `speckit-launch` 或 `npx speckit-launch`：

```bash
cd speckit-launch
npm run link          # 等同於 npm link
```

建立連結後，即可在任何目錄建立新專案：

```bash
npx speckit-launch my-app
# 或直接調用：
speckit-launch my-app
```

若日後需要解除連結：

```bash
npm run unlink        # 等同於 npm unlink -g speckit-launch
```


### 旗標

| 旗標 | 說明 |
|------|------|
| `--here` | 在目前目錄初始化（若有設 `--dir` 則用那個路徑） |
| `--dir <path>` | `<name>` 的上層目錄；搭配 `--here` 時則是目標路徑 |
| `--only <integration>` | 只裝這一個 Spec Kit 整合（略過主流組合） |
| `--script sh\|ps\|py` | helper script 類型（預設：Windows 為 `ps`，其他為 `sh`） |
| `--no-git` | 略過 `git init` |
| `--version`, `-v` | 顯示版本號 |
| `--help` | 顯示用法 |

具名專案建在 **目前工作目錄** 底下，除非有設 `--dir`。

## 它做了什麼

1. 確認 `specify` 可用（必要時 `uv tool install specify-cli`）
2. `git init`（可選）
3. 對第一個整合跑 `specify init`，其餘主流組合用 `specify integration install --force`（若有 `--only` 則只裝那一個）
4. 把 `speckit-*` skills 去重收進 `.agents/skills`
5. 寫入 `.agents/skills.json` 與 `.agents/AGENTS.md`（串接流程）
6. 寫入 `.cursor/rules/speckit-pipeline.mdc`，並安裝 `.specify/workflows/overlays/speckit/chained-sdd.yml`（**不**覆蓋官方 bundled `workflow.yml`）
7. 安裝本地 `chained-sdd` preset（`specify preset add --dev`），讓 `/speckit-constitution` 把流程原則 append 進憲章 scaffold。尚未填寫的 `constitution.md` 也會種入同一段。不複製別的專案已填好的 constitution。 **尚未** 發佈到 Spec Kit catalog。
8. 若已存在 agent 說明檔（`AGENTS.md`、`CLAUDE.md`、`GEMINI.md`、`.github/copilot-instructions.md`），補一段流程 pointer
9. 複製並執行 `scripts/link-agent-skills.mjs`（Windows junction／Unix 符號連結）
10. 把 skill-mount 規則合併進 `.gitignore`
11. 寫入或合併 `.gitattributes`（`* text=auto eol=lf`），讓新專案在 Windows／macOS／Linux 都維持 LF

它 **不會** 複製別的專案的產品憲章。啟動完成後，在新專案跑 `/speckit-constitution`（保留已種入的流程原則；其餘填 **這個** 產品自己的）。

## Spec Kit 流程（從實際專案抽出）

官方 Spec Kit 把 clarify／analyze／checklist 當可選品質閘門，bundled workflow 還會無條件停在「先 review spec／plan」。

這個啟動器疊上實際專案在用的 **完整串接**：

```
specify → clarify → plan → tasks → analyze → implement → converge
```

| 步驟 | 預設行為 |
|------|----------|
| **specify** 之後 | 一定跑 **clarify**（不要跳去 plan） |
| **clarify** 之後 | 僅當 `[NEEDS CLARIFICATION]` 還在、spec checklist 未過、或仍有 Outstanding／高影響項 → **暫停**。已經答完並寫進 spec 的題目不必再確認 → **立刻繼續** plan |
| **plan** 之後 | 一定跑 **tasks** |
| **tasks** 之後 | 一定跑 **analyze** |
| **analyze** 之後 | 任何 CRITICAL／HIGH／MEDIUM 發現 → **暫停**。零發現或只有 LOW → **立刻繼續** implement |
| **implement** 之後 | 跑 **converge**。若有補上 tasks，再 implement 然後 converge（收斂就停，或最多 3 輪） |

單一 slash command（只跑 `/speckit-plan` 等）**不會**啟動整條鏈。`/speckit-checklist` 維持可選，不在預設鏈裡。

寫進新專案的 overlay：

- `.agents/AGENTS.md` — 流程與自主推進的 canonical 規則
- `.cursor/rules/speckit-pipeline.mdc` — Cursor `alwaysApply` 的暫停規則
- `.specify/workflows/overlays/speckit/chained-sdd.yml` — Spec Kit 1.0 overlay：拿掉兩道 review gate，插入 clarify／analyze／converge。官方 `workflow.yml` 仍可單獨升級
- `chained-sdd` preset — 把 **Autonomy & Spec Kit pipeline** 原則 append 到 `constitution-template`（本地 `--dev` 安裝；不是 catalog 發行）。尚未填寫的 `constitution.md` 同樣種入

### 各階段模型與 Agent 分工 (Model & Agent Routing)

Spec Kit 各階段產物皆實體落盤於 `specs/<feature>/`，階段彼此解耦，完全支援依任務屬性分工：

| 階段 | 建議能力等級 | 推薦模型範例 | 主要目標 |
|------|-------------|--------------|----------|
| `specify` / `clarify` | 深度推理 / Thinking (CoT) | Claude 3.7 Sonnet (Thinking)、o3-mini、Gemini 2.5 Pro | 提早釐清隱性限制、邊界條件與歧義 |
| `plan` | 系統架構推理 | Claude 3.7 Sonnet、GPT-4o | 建立清晰系統邊界與相依性規劃 |
| `tasks` | 結構化任務拆解 | 主力旗艦模型 | 產出結構清晰、可逐條驗收的任務圖 |
| `analyze` | 大 Context / 全域稽核 | Gemini 1.5/2.0 Pro、Claude 3.7 Sonnet | 比對全專案 codebase 與規格，無 Context 截斷 |
| `implement` / `converge` | 敏捷、高產出編碼 | Claude 3.5/3.7 Sonnet、GPT-4o、DeepSeek-V3 | 高速撰寫程式碼、快速跑測試與迭代收斂 |

- **執行時動態決定**：預設不硬編碼模型，由當下執行的 Agent / CLI 依據上方能力等級動態輸入或選用最適模型。
- **用戶手動覆寫**：若用戶希望固定特定步驟的模型，可隨時在專案的 `.specify/workflows/overlays/speckit/chained-sdd.yml`（涵蓋全部 7 個步驟）解除註解並指定 `model:` 或 `integration:`，手動配置具最高優先級。
- **單 Agent vs 多 Agent**：啟動器初始化時會自動探測 PATH 上的 Agent CLIs。單 Agent 環境自動平滑回退，多 Agent 環境提示進階分工路徑。

> [!IMPORTANT]
> **關鍵結論：Agent 在執行過程中不會「自動」跨模型切換**
> - **在 IDE / 聊天視窗中（如 Cursor、Claude Code、Copilot）**：對話模型是由你在介面下拉選單決定的，當前運行的模型無法自我抽換或在背後切換底層 Model；`AGENTS.md` 的表格是**給開發者的切換指引**（提示你在不同階段手動切換最適模型）。
> - **唯一能自動切換模型的方式：使用 CLI 工作流**：只有當你透過終端機執行 `specify workflow run speckit` 時，Spec Kit 的排程引擎才會在背景依照 `.specify/workflows/overlays/speckit/chained-sdd.yml` 裡**明確寫出的 `model:` 與 `integration:`** 自動依步驟調用不同 CLI 與模型。若 YAML 裡未指定，則一律使用該 CLI 的預設模型。



產品特有規則（領域模型、UI kit、changelog 格式……）不放進這個啟動器。那些用新專案的 `/speckit-constitution` 寫。

## 升級 `specify` CLI 之後

這個 repo 是 **啟動器**，不是 Spec Kit 專案。這裡沒有 `.specify/`。**不要**在這個目錄跑 `specify integration upgrade`。

之後新建的專案，下次跑 `node bin/new-project.mjs` 就會用到新的 CLI。要讓啟動器本身保持相容：

1. 確認 CLI：`specify version`（最近實測：**1.0.4**；最低需求：**1.0+**）
2. 大版本若改旗標，掃過 `specify init --help` 與 `specify integration install --help`
3. 確認 bundled `speckit` workflow 仍有這些 step id（overlay 錨點）：`specify`、`review-spec`、`plan`、`review-plan`、`tasks`、`implement`
4. 煙霧測試：`node bin/new-project.mjs --only grok --no-git smoke-app --dir %TEMP%`（或 `$TMPDIR`）
5. 在測試專案確認 `.specify/workflows/overlays/speckit/chained-sdd.yml` 存在，且 `specify workflow resolve speckit` 顯示 clarify／analyze／converge、沒有 review gate
6. 若步驟 2–5 需要改啟動器或 overlay，再 commit

已經建好的 app 在 **那個 repo** 升級：

```bash
specify integration upgrade          # 每個已安裝的 integration key 跑一次
specify extension update
node scripts/link-agent-skills.mjs   # 若該專案有用 skill mount
```

不要把 `new-project.mjs --here` 當升級路徑。

## clone 之後

由這個啟動器建出的專案裡：

```bash
node scripts/link-agent-skills.mjs
```

（可選：在該專案的 `package.json` 加 `"postinstall": "node scripts/link-agent-skills.mjs"`。）

## 使用者層級的 agent skill

把 [`skill/new-project/SKILL.md`](skill/new-project/SKILL.md) 複製到你的 agent 使用者 skills 目錄（例如 `~/.cursor/skills/new-project/` 或 `~/.claude/skills/new-project/`）。

用 `SPECKIT_STARTER` 或對話裡提供的路徑指向這個 repo — 不要寫死機器專用路徑。

## 目錄結構

```text
speckit-launch/
  .gitattributes
  .editorconfig
  bin/new-project.mjs
  scripts/link-agent-skills.mjs
  templates/
    gitignore.fragment
    gitattributes.fragment
    AGENTS.md
    skills.json
    speckit-pipeline.mdc
    speckit-overlay.yml
  presets/chained-sdd/
    preset.yml
    templates/constitution-pipeline.md
  skill/new-project/SKILL.md
  package.json
  LICENSE
  README.md
  README.zh-Hant.md
```

## 授權

MIT — 見 [LICENSE](LICENSE)。

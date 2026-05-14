# VS Code extension (`apps/vscode-extension`)

## 1. Install

```bash
cd apps/vscode-extension
npm install
```

## 2. Build

```bash
npm run compile
```

開發時可另開終端：

```bash
npm run watch
```

## 3. Run

- **Monorepo 根目錄**開啟本 repo：使用除錯設定 **「Run Extension (Local AI)」**（會先執行 `compile-vscode-extension`）。
- **僅**開啟 `apps/vscode-extension` 資料夾：使用 **「Run Extension」**（會先執行 `compile`）。

需本機已啟動 [Ollama](https://ollama.com)，且設定中的 model 已 `ollama pull`。

## Settings

- `localAi.ollamaUrl`（預設 `http://127.0.0.1:11434`）
- `localAi.model`（預設 `llama3.2`）

## UI

Activity Bar → **Local AI** → 側邊欄 Chat：輸入後 Enter 送出（Shift+Enter 換行）。

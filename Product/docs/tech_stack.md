# Tech stack

本文件記錄**預定**技術棧與邊界；實作與版本鎖定延至 Phase 0 之後。

---

## 用戶端

| 層 | 選型 | 備註 |
|----|------|------|
| Desktop shell | Tauri 2.x（預定） | `apps/desktop` |
| Desktop UI | React + TypeScript | 與 Tauri webview 同構 |
| VS Code | TypeScript | `apps/vscode-extension`；薄層呼叫本機 API |

---

## 服務端（編排）

| 層 | 選型 | 備註 |
|----|------|------|
| HTTP / WebSocket | FastAPI（預定） | API 宿主目錄於 Phase 0 建立（見 `tasks/phase_0_setup.md`） |
| 執行環境 | Python 3.12+（預定） | 與 `packages/*` 同 workspace |

---

## 模組套件（`packages/*`）

| 套件 | 職責 |
|------|------|
| `agent-core` | 對話狀態、tool loop、與 LLM 訊息組裝 |
| `llm-router` | Ollama、OpenAI 相容（NIM、llama-server）統一介面 |
| `tools` | 內建工具：讀寫檔、終端、grep 等 |
| `mcp` | MCP client（stdio／可選 streamable HTTP） |
| `rag` | 索引、embedding、向量查詢 |
| `memory` | 跨 session 專案記憶（與 RAG 分離） |
| `shared` | 設定 schema、共用型別、常數、小工具 |

語言預設以 **Python** 實作上述 packages（與 FastAPI 同進程匯入）；若未來抽出 TS 共用型別，仍歸 `packages/shared` 子目錄並於架構圖註記。

---

## 外部執行時（不 vendoring 上游原始碼）

| 元件 | 用途 |
|------|------|
| Ollama | 本機模型服務 |
| llama.cpp / llama-server | 可選本機或相容 API |
| MCP servers | 使用者設定之副進程 |
| Chroma / FAISS | 向量索引（擇一或分層使用，見 roadmap） |
| Tree-sitter | 解析／chunk 邊界（官方 binding） |

---

## 開發體驗（Phase 0 啟用，**本 skeleton 不附 lockfile**）

- Python：ruff、pytest、mypy（可選）— **待 Phase 0 安裝**  
- TS：eslint、prettier、typescript — **待 Phase 0 安裝**  
- CI：lint + typecheck + smoke test — **待 Phase 0 定義**

---

## 版本策略

- **MCP**：鎖定 `modelcontextprotocol` schema 某一日期版本後再升級。  
- **LLM API**：以 OpenAI 相容欄位為準，避免供應商專用欄位洩漏至核心。

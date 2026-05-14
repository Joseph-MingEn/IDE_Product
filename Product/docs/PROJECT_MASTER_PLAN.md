# Project master plan

**產品定位**：本地優先（local-first）的 AI Coding Assistant，體驗對齊 Cursor／Cline 等，但資料與推論預設留在使用者可控環境。

**參考 repo**（僅研究，不進 build 樹）：`cline-main`、`continue-main`、`aider-main`、`openhands-aci-main`、`ollama-main`、`llama.cpp-master`、`modelcontextprotocol-main`、`tree-sitter-master`、`chroma-main`、`faiss-main`。

---

## 能力目標

| 能力 | 說明 |
|------|------|
| 本地 Ollama | 預設 LLM 後端；HTTP API 整合 |
| 可選 NVIDIA NIM | OpenAI 相容 `base_url`／金鑰設定 |
| MCP tools | MCP client；外掛工具與內建工具統一暴露給 agent |
| Codebase RAG | 索引、chunk、向量檢索（Chroma 或 FAISS，Phase 2 鎖定預設） |
| Multi-file editing | 單次任務內多檔一致變更與 diff 呈現 |
| Terminal execution | 工作區內受控執行；allowlist 或確認策略 |
| VS Code extension / desktop app | `apps/vscode-extension` 與 `apps/desktop`（Tauri + React + TypeScript） |

---

## 技術棧摘要

詳見 `docs/tech_stack.md`。

- **桌面**：Tauri、React、TypeScript  
- **編排與 API**：Python、FastAPI（API 宿主目錄於 Phase 0 決定，見 `tasks/phase_0_setup.md`）  
- **邏輯模組**：`packages/*`（agent、LLM 路由、tools、rag、memory、mcp、shared）  
- **推論**：Ollama、llama.cpp（`llama-server`）  
- **模型範例**：Qwen2.5-Coder、DeepSeek-Coder  
- **RAG 儲存**：ChromaDB、FAISS（擇一為 MVP 後預設）  
- **解析**：Tree-sitter  
- **Agent 設計**：Cline 啟發之工具型 agent；OpenHands 啟發之 task loop（Phase 3）

---

## 產品階段（對齊 roadmap）

### Phase 1 — MVP

- Chat with codebase（可先無向量 RAG，依 `docs/mvp_definition.md`）
- File editing
- Terminal tool

### Phase 2

- Multi-file autonomous edit
- RAG retrieval
- Project memory

### Phase 3

- Autonomous software engineer
- Self-debugging
- Planning system

---

## 文件索引

| 文件 | 用途 |
|------|------|
| `docs/system_architecture.md` | 邏輯與實體架構 |
| `docs/repository_analysis.md` | 參考專案分析 |
| `docs/mvp_definition.md` | MVP 邊界與驗收 |
| `docs/roadmap.md` | 時程與階段 |
| `docs/tech_stack.md` | 技術選型與版本策略 |

根目錄 `PROJECT_MASTER_PLAN.md` 若仍存在，僅作導向本檔之 stub。

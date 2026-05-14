# Roadmap

對齊 `docs/PROJECT_MASTER_PLAN.md`；執行勾選見 `tasks/`。

---

## Phase 0 — Setup

- Monorepo：`apps/*`、`packages/*`、`docs`、`tasks` 就緒（見 `tasks/phase_0_setup.md`）。
- 決定並建立 **FastAPI 宿主**目錄與最小 `/health`。
- Desktop 空殼可啟動；可選 VS Code 擴充空殼。
- 開發規範：Python／TS lint 與 CI 骨架（**不**在本階段安裝大量套件，依 task 清單逐步來）。

**驗收**：README 記載啟動步驟；健康檢查通過。

---

## Phase 1 — MVP

見 `docs/mvp_definition.md` 與 `tasks/phase_1_mvp.md`。

- Chat with codebase（無向量 RAG 可接受）
- File editing、Terminal、Ollama + 可選 NIM（OpenAI 相容）

---

## Phase 1.5 — MCP

- `packages/mcp`：client、設定檔、與 `agent-core` 工具合併
- 至少一個官方 MCP server 走通

---

## Phase 2 — RAG、多檔、記憶

- `packages/rag`：索引管線；Chroma **或** FAISS 擇一為預設（見 `docs/system_architecture.md` 決策表）
- Multi-file editing 強化
- `packages/memory`：跨 session 專案記憶

---

## Phase 3 — 自主與規劃

- OpenHands 風格 task loop
- Self-debugging（測試／build 輸出驅動）
- Planning UI（可選）

---

## 參考

- 技術棧：`docs/tech_stack.md`
- 參考 repo：`docs/repository_analysis.md`

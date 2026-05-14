# Phase 1 — MVP

前置：**Phase 0** 完成（見 `tasks/phase_0_setup.md`）。  
邊界：**`docs/mvp_definition.md`**。

本清單為**規劃用**；實作時再拆 issue／PR。

---

## 後端與 packages

- [ ] FastAPI 宿主：對外 REST 或 WebSocket（串流策略待定）
- [ ] `packages/ai-core`：Ollama chat；OpenAI 相容 `base_url`（**NIM**）；共用設定 schema
- [ ] `packages/agent-runtime`：單／多步 tool loop、取消 token；內建 `read_file`／`list_dir`／`grep`／`write_file`（或 patch）
- [ ] `packages/mcp-tools`：**可 stub**（回傳空工具表）；完整 MCP 屬 Phase 1.5
- [ ] `packages/rag-indexer`：**no-op** 或可選關閉
- [ ] 跨 session **memory**：可先併入 `agent-runtime`（session-only）或日後獨立套件

---

## 桌面

- [ ] `apps/desktop`：聊天 UI 雛型、工作區選擇、連線狀態
- [ ] 與 API 通訊（HTTP 或 WS）
- [ ] 終端輸出區（可先唯讀匯總）

---

## 安全

- [ ] 路徑沙箱（工作區外拒絕）
- [ ] 終端：allowlist **或**逐步確認（擇一並文件化）

---

## VS Code（可晚於桌面）

- [ ] `apps/vscode-extension`：最小啟動命令「連線本機 API」
- [ ] 不重複實作 `agent-runtime`（僅客戶端）

---

## 驗收

滿足 `docs/mvp_definition.md` §4 演示劇本；並通過 Phase 0 已定義之最小 CI（若已啟用）。

---

## Phase 2 預告（勿在本 phase 實作）

RAG、memory 持久化、MCP 完整、多檔強化 — 見 `docs/roadmap.md`。

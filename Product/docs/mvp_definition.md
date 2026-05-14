# MVP definition

**一句話**：在使用者本機（或使用者指定工作區）內，以對話完成**讀懂程式碼、修改檔案、執行受控終端**，預設 LLM 為 **Ollama**；**NIM** 為可選 OpenAI 相容端點。

**主計畫**：`docs/PROJECT_MASTER_PLAN.md`。

**窄幅先行版**：若僅做 VS Code + Ollama、無 RAG／無自主 agent，請用 **[MVP v0.1 清單](mvp_v0.1_checklist.md)**。

---

## 1. MVP 必須（Phase 1）

| ID | 能力 | 說明 |
|----|------|------|
| M1 | 工作區 | 單一根目錄；後端路徑沙箱。 |
| M2 | 對話 | 自然語言任務；可顯示即將執行的工具呼叫（實作階段定 UI 細節）。 |
| M3 | 讀碼上下文 | 讀檔、列目錄、專案內搜尋；**不要求** 向量 RAG。 |
| M4 | 檔案編輯 | 至少一種安全套用流程（整檔或 patch）。 |
| M5 | 終端 | 於工作區內執行；**allowlist 或逐步確認** 擇一為最低安全線。 |
| M6 | LLM | `packages/ai-core`：**Ollama** 為預設；可設定 OpenAI 相容 URL（**NIM**）。 |

---

## 2. MVP 不包含

- **MCP 完整整合**（延至 roadmap Phase 1.5；`packages/mcp-tools` 可 stub）。
- **RAG 向量索引**（`packages/rag-indexer` 可 no-op；Phase 2）。
- **跨 session memory 產品化**（可先併入 `agent-runtime`；Phase 2）。
- **VS Code extension 上架**（`apps/vscode-extension` 可晚於桌面，但目錄保留）。
- **多檔自主編排完整版**（MVP 允許單檔為主；多檔為 Phase 2 強化）。

---

## 3. 與目錄對應

| MVP 需要 | 骨架目錄 |
|------------|-----------|
| UI + OS 能力 | `apps/desktop` |
| 編排 + API | Phase 0 建立之 FastAPI 宿主（見 `tasks/phase_0_setup.md`） |
| Agent loop | `packages/agent-runtime` |
| LLM | `packages/ai-core` |
| 內建工具 | `packages/agent-runtime` |
| 共用設定／型別 | `packages/ai-core` |

---

## 4. 驗收劇本（演示）

1. 選擇本機專案資料夾為工作區。  
2. 詢問「入口檔／某目錄職責」——助理僅用讀檔／搜尋回答。  
3. 要求變更某檔常數或函式名——套用後內容正確。  
4. 執行一條已允許或已確認的指令——輸出可回到 UI。

---

## 5. 非功能最低線

- 本機優先：未設定雲端 API 時不傳程式碼至第三方。  
- 可中止長推理／長指令（架構預留）。  
- 結構化日誌（request id、tool 名稱）。

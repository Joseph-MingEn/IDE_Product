# Phase 0 — Setup

本階段只建立**可維護的骨架與文件**，不實作 agent／RAG 等功能邏輯；**不**安裝套件，直至本清單明確允許之步驟。

---

## Repository 結構

- [ ] 確認目錄存在：`apps/desktop`、`apps/vscode-extension`
- [ ] 確認目錄存在：`packages/agent-core`、`llm-router`、`tools`、`rag`、`memory`、`mcp`、`shared`
- [ ] 確認 `docs/`、`tasks/` 內主文件為最新（見下方「文件」）
- [ ] 清理或標註棄用：根目錄舊式 `backend/`、`frontend/`、`agent/` 等（若仍存在）

---

## API 宿主（FastAPI）

- [ ] **決定** API 宿主路徑（建議新增 `services/api/`，與 `apps/` 分離；若採單一資料夾策略請更新 `docs/system_architecture.md`）
- [ ] 建立該目錄與最小 `README` 說明用途（可僅一行）
- [ ] 預留 `GET /health` 實作位置（**先不寫**執行碼亦可，但須在 README 註記）

---

## 應用殼

- [ ] `apps/desktop`：預留 Tauri 將放置位置（Phase 0 後半可 `tauri init`）
- [ ] `apps/vscode-extension`：預留 `package.json` 將放置位置（**先不** `npm init` 直至核准）

---

## Python packages 佈局

- [ ] 決定 `packages/*` 以 **src layout** 或 **flat layout** 匯入 FastAPI（於架構文件註記）
- [ ] 根層 `pyproject.toml` 或 `services/api/pyproject.toml` 策略（**先不**加入依賴版本鎖定）

---

## TypeScript / VS Code

- [ ] 決定 extension 與 desktop 是否共用 `packages/shared` 的型別（JSON Schema 優先或 hand-written TS）

---

## CI / 品質

- [ ] 選擇 CI 平台與最小 workflow 檔名（**先可不提交** workflow，僅決策）

---

## 文件

- [ ] `docs/PROJECT_MASTER_PLAN.md`
- [ ] `docs/system_architecture.md`
- [ ] `docs/repository_analysis.md`
- [ ] `docs/mvp_definition.md`
- [ ] `docs/roadmap.md`
- [ ] `docs/tech_stack.md`
- [ ] 根 `README.md`：連結至 `docs/` 與 Phase 0/1 tasks

---

## 驗收（Phase 0 結束）

1. 目錄樹符合 `docs/system_architecture.md` §3。  
2. 文件彼此交叉引用正確。  
3. 無從參考 repo **複製**之業務原始碼。  
4. **尚未**執行 `npm install` / `pip install`（除非團隊明確核准第一輪依賴）。

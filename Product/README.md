# Local AI Coding Assistant（skeleton）

本地優先的 AI 編程助理：Ollama、可選 NVIDIA NIM（OpenAI 相容）、MCP、RAG、多檔編輯、終端、桌面與 VS Code。

## 文件

- [主計畫](docs/PROJECT_MASTER_PLAN.md)
- [系統架構](docs/system_architecture.md)
- [參考 repo 分析](docs/repository_analysis.md)
- [MVP 定義](docs/mvp_definition.md)
- [路線圖](docs/roadmap.md)
- [技術棧](docs/tech_stack.md)

## 任務

- [Phase 0 — Setup](tasks/phase_0_setup.md)
- [Phase 1 — MVP](tasks/phase_1_mvp.md)

## Monorepo 目錄

| 路徑 | 說明 |
|------|------|
| `apps/vscode-extension/` | VS Code 擴充（目前主要可執行目標） |
| `packages/ai-core/` | LLM／prompt／共用型別等核心抽象（預留） |
| `packages/agent-runtime/` | Agent 執行期／tool loop（預留） |
| `packages/mcp-tools/` | MCP 客戶端與工具整合（預留） |
| `packages/rag-indexer/` | RAG 索引與檢索（預留） |
| `docs/` | 主計畫與架構文件 |
| `scripts/` | 建置／維運腳本（預留） |

上游參考 clone 請放本機並由根目錄 `.gitignore` 排除，勿再提交進 Git。詳見 `docs/system_architecture.md` §3。

**注意**：擴充以外多數套件尚未初始化；請依 `tasks/phase_0_setup.md` 逐步進行。

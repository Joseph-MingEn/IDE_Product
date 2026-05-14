# Repository analysis

工作區內**參考用** clone 的架構與功能摘要；供對照本產品之 `packages/*` 與 `apps/*`，**不**複製其原始碼。

---

## 總覽

| Repository | 型態 | 重點 |
|------------|------|------|
| cline-main | VS Code 擴充 + webview + CLI | IDE 內 agent、MCP、工具核准流程 |
| continue-main | TS monorepo（core、gui、vscode、binary） | 多套件邊界、CI checks 思路 |
| aider-main | Python 終端應用 | repomap、git、多檔編修 |
| openhands-aci-main | Python 庫（**已 archive**） | ACI：編輯、tree-sitter lint；新設計對照 Agent SDK |
| ollama-main | Go 服務 | 本機模型與 HTTP API |
| llama.cpp-master | C++ CMake | 推論、`llama-server` |
| modelcontextprotocol-main | 規格與 schema | MCP 契約來源 |
| tree-sitter-master | Rust + C | 增量解析、grammar |
| chroma-main | Python + Rust | 向量儲存與檢索產品化 |
| faiss-main | C++ + Python | 大規模向量索引 |

---

## 與本產品模組對照（概念）

| 本產品 package | 可對照參考 |
|----------------|------------|
| `agent-core` | Cline／Aider／Continue 的 agent 迴圈（僅概念） |
| `llm-router` | Ollama／OpenAI 相容用戶端模式 |
| `tools` | Cline、Aider、openhands-aci 之檔案／終端工具邊界 |
| `mcp` | MCP 規格 repo + Cline MCP 整合經驗 |
| `rag` | Chroma／FAISS 官方用法；chunk 可結合 tree-sitter |
| `memory` | Master plan Phase 2「project memory」 |
| `apps/desktop` | 桌面體驗參考 Cline webview 與 Tauri 慣例 |
| `apps/vscode-extension` | Cline／Continue 擴充打包與訊息通道 |

---

## 採用策略

| 類型 | 做法 |
|------|------|
| Ollama、llama.cpp | 以外部行程／API 整合 |
| MCP | 自研 client，對齊官方 schema 版本 |
| Tree-sitter、Chroma、FAISS | 官方套件／binary |
| Cline、Continue、Aider、openhands-aci | 僅閱讀架構與互動 |

---

## 功能重疊提醒

多個參考專案皆涵蓋「對話 + 工具 + 編輯」；本產品維持 **單一 `agent-core` + `tools` + `mcp`**，避免平行實作多套 agent。

詳見 `docs/system_architecture.md`。

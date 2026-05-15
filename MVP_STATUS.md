# Local AI IDE MVP Status

## Completed

- [x] Local Ollama chat
- [x] Active file context
- [x] Selection context
- [x] `/edit` command
- [x] Whole-file AI rewrite
- [x] VS Code diff preview
- [x] Accept Preview flow
- [x] Safe buffer apply
- [x] No auto-save
- [x] Typed webview protocol
- [x] In-memory preview document
- [x] Diff sanitizer
- [x] Diff validator

---

## Next Priority

- [ ] Streaming response
- [ ] Markdown renderer
- [ ] Syntax highlight
- [ ] Better prompt control
- [ ] Chat history persistence

---

## Future

- [ ] Repo indexing
- [ ] Multi-file edit
- [ ] Tool calling
- [ ] Agent workflow
- [ ] MCP integration
- [ ] Semantic search
- [ ] RAG
- [ ] Tree-sitter support

---

## Current Architecture

```txt
Webview UI
↕
Typed Protocol
↕
VSCode Extension Host
↕
Ollama Local Model
↕
Safe Preview Flow
↕
Accept Preview
↕
Editor Buffer Apply
```

---

## Current Model

- Ollama
- qwen2.5-coder:7b

---

## Safety Rules

- No automatic file save
- No automatic applyEdit without user confirmation
- All AI edits must go through diff preview
- Accept Preview is required before modifying editor buffer
- AI output is treated as untrusted input
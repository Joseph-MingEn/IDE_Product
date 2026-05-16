import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { ChatMessage, ExtensionToWebview } from '../protocol';
import { AssistantMarkdown } from './AssistantMarkdown';
import { getVsCodeApi } from './vscodeApi';

type Msg = ChatMessage;

function looksLikeUnifiedDiff(text: string): boolean {
  const t = text.trimStart();
  if (t.startsWith('Error:')) {
    return false;
  }
  if (t.startsWith('--- ')) {
    return true;
  }
  if (t.startsWith('diff --git')) {
    return true;
  }
  if (t.includes('\n+++ ') && t.includes('\n@@')) {
    return true;
  }
  if (t.startsWith('@@')) {
    return true;
  }
  return false;
}

function appendAssistantError(messages: Msg[], errorText: string): Msg[] {
  if (messages.length === 0 || messages[messages.length - 1].role !== 'assistant') {
    return [...messages, { role: 'assistant', text: `Error: ${errorText}` }];
  }
  const next = [...messages];
  const last = next[next.length - 1];
  next[next.length - 1] = {
    role: 'assistant',
    text: last.text.length > 0 ? `${last.text}\n\nError: ${errorText}` : `Error: ${errorText}`,
  };
  return next;
}

export function App(): JSX.Element {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewPending, setPreviewPending] = useState<{ active: boolean; label?: string }>({
    active: false,
  });

  useEffect(() => {
    const handler = (event: MessageEvent<ExtensionToWebview>) => {
      const data = event.data;
      if (!data || typeof data !== 'object') {
        return;
      }
      if (data.type === 'hydrateMessages') {
        setMessages(data.messages);
        return;
      }
      if (data.type === 'previewPending') {
        setPreviewPending({ active: true, label: data.relativePath });
        return;
      }
      if (data.type === 'previewCleared') {
        setPreviewPending({ active: false });
        return;
      }
      if (data.type === 'replyStart') {
        setLoading(true);
        setMessages((m) => [...m, { role: 'assistant', text: '' }]);
        return;
      }
      if (data.type === 'replyDelta') {
        setMessages((m) => {
          if (m.length === 0 || m[m.length - 1].role !== 'assistant') {
            return [...m, { role: 'assistant', text: data.text }];
          }
          const next = [...m];
          const last = next[next.length - 1];
          next[next.length - 1] = { role: 'assistant', text: last.text + data.text };
          return next;
        });
        return;
      }
      if (data.type === 'replyDone') {
        setLoading(false);
        return;
      }
      if (data.type === 'reply') {
        setLoading(false);
        setMessages((m) => [...m, { role: 'assistant', text: data.text }]);
      } else if (data.type === 'error') {
        setLoading(false);
        setMessages((m) => appendAssistantError(m, data.text));
      }
    };
    window.addEventListener('message', handler);
    getVsCodeApi().postMessage({ type: 'getPreviewState' });
    return () => window.removeEventListener('message', handler);
  }, []);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || loading) {
      return;
    }
    setInput('');
    setMessages((m) => [...m, { role: 'user', text }]);
    setLoading(true);
    getVsCodeApi().postMessage({ type: 'chat', text });
  }, [input, loading]);

  const clearChat = useCallback(() => {
    if (loading) {
      return;
    }
    getVsCodeApi().postMessage({ type: 'clearHistory' });
  }, [loading]);

  return (
    <main style={styles.main}>
      <div style={styles.toolbarRow}>
        <button type="button" style={styles.clearBtn} onClick={clearChat} disabled={loading}>
          Clear Chat
        </button>
      </div>
      <div style={styles.list}>
        {messages.map((msg, i) =>
          msg.role === 'user' ? (
            <div key={i} style={styles.messageRowUser}>
              <div style={styles.userBubble}>{msg.text}</div>
            </div>
          ) : (
            <div key={i} style={styles.messageRowAssistant}>
              <div style={styles.assistantBubble}>
                {looksLikeUnifiedDiff(msg.text) ? (
                  <div style={styles.diffBlock}>
                    <pre style={styles.diffPre}>{msg.text}</pre>
                    <button
                      type="button"
                      style={styles.applyBtn}
                      onClick={() =>
                        getVsCodeApi().postMessage({ type: 'applyDiff', diffText: msg.text })
                      }
                    >
                      Apply（diff 預覽）
                    </button>
                  </div>
                ) : (
                  <AssistantMarkdown text={msg.text} />
                )}
              </div>
            </div>
          ),
        )}
      </div>
      {previewPending.active ? (
        <div style={styles.acceptRow}>
          <button
            type="button"
            style={styles.acceptBtn}
            onClick={() => getVsCodeApi().postMessage({ type: 'acceptPreview' })}
          >
            Accept Preview{previewPending.label ? ` (${previewPending.label})` : ''}
          </button>
          <button
            type="button"
            style={styles.rejectBtn}
            onClick={() => getVsCodeApi().postMessage({ type: 'rejectPreview' })}
          >
            Reject Preview
          </button>
        </div>
      ) : null}
      <div style={styles.composer}>
        <textarea
          style={styles.input}
          rows={3}
          value={input}
          disabled={loading}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button type="button" style={styles.btn} onClick={send} disabled={loading}>
          {loading ? 'Sending…' : 'Send'}
        </button>
      </div>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  main: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
    boxSizing: 'border-box',
    padding: 8,
    gap: 8,
    overflow: 'hidden',
  },
  toolbarRow: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  clearBtn: {
    padding: '4px 10px',
    fontSize: 12,
    cursor: 'pointer',
    borderRadius: 6,
  },
  list: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    fontSize: 13,
  },
  messageRowUser: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    width: '100%',
  },
  messageRowAssistant: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    width: '100%',
  },
  userBubble: {
    maxWidth: '88%',
    padding: '10px 12px',
    borderRadius: 8,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    background: 'var(--vscode-input-background)',
    color: 'var(--vscode-input-foreground)',
    border: '1px solid var(--vscode-input-border, var(--vscode-widget-border))',
    boxSizing: 'border-box',
  },
  assistantBubble: {
    maxWidth: '92%',
    padding: '10px 12px',
    borderRadius: 8,
    background: 'var(--vscode-editorWidget-background)',
    color: 'var(--vscode-editorWidget-foreground, var(--vscode-foreground))',
    border: '1px solid var(--vscode-widget-border)',
    boxSizing: 'border-box',
  },
  diffBlock: { display: 'flex', flexDirection: 'column', gap: 8, width: '100%' },
  diffPre: {
    margin: 0,
    padding: 8,
    overflow: 'auto',
    maxHeight: 320,
    fontFamily: 'var(--vscode-editor-font-family)',
    fontSize: 'var(--vscode-editor-font-size)',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    background: 'var(--vscode-textCodeBlock-background)',
    border: '1px solid var(--vscode-widget-border)',
    borderRadius: 6,
  },
  applyBtn: { alignSelf: 'flex-start', padding: '6px 10px', cursor: 'pointer' },
  acceptRow: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  acceptBtn: { padding: '6px 10px', cursor: 'pointer', alignSelf: 'flex-start' },
  rejectBtn: { padding: '6px 10px', cursor: 'pointer', alignSelf: 'flex-start' },
  composer: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    minHeight: 60,
    resize: 'vertical',
    maxHeight: 160,
    fontFamily: 'var(--vscode-font-family)',
    boxSizing: 'border-box',
    borderRadius: 6,
  },
  btn: {
    height: 40,
    minHeight: 40,
    minWidth: 72,
    padding: '0 12px',
    cursor: 'pointer',
    flexShrink: 0,
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
};

import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { ExtensionToWebview } from '../protocol';
import { getVsCodeApi } from './vscodeApi';

type Msg = { role: 'user' | 'assistant'; text: string };

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

export function App(): JSX.Element {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Msg[]>([]);

  useEffect(() => {
    const handler = (event: MessageEvent<ExtensionToWebview>) => {
      const data = event.data;
      if (!data || typeof data !== 'object') {
        return;
      }
      if (data.type === 'reply') {
        setMessages((m) => [...m, { role: 'assistant', text: data.text }]);
      } else if (data.type === 'error') {
        setMessages((m) => [...m, { role: 'assistant', text: `Error: ${data.text}` }]);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text) {
      return;
    }
    setInput('');
    setMessages((m) => [...m, { role: 'user', text }]);
    getVsCodeApi().postMessage({ type: 'chat', text });
  }, [input]);

  return (
    <main style={styles.main}>
      <div style={styles.list}>
        {messages.map((msg, i) => (
          <div key={i} style={msg.role === 'user' ? styles.user : styles.assistant}>
            {msg.role === 'assistant' && looksLikeUnifiedDiff(msg.text) ? (
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
              msg.text
            )}
          </div>
        ))}
      </div>
      <div style={styles.composer}>
        <textarea
          style={styles.input}
          rows={3}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button type="button" style={styles.btn} onClick={send}>
          Send
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
  list: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    fontSize: 13,
  },
  user: { alignSelf: 'flex-end', maxWidth: '90%', whiteSpace: 'pre-wrap' },
  assistant: { alignSelf: 'flex-start', maxWidth: '90%', whiteSpace: 'pre-wrap' },
  diffBlock: { display: 'flex', flexDirection: 'column', gap: 8, width: '100%' },
  diffPre: {
    margin: 0,
    padding: 8,
    overflow: 'auto',
    maxHeight: 360,
    fontFamily: 'var(--vscode-editor-font-family)',
    fontSize: 'var(--vscode-editor-font-size)',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    background: 'var(--vscode-textCodeBlock-background)',
    border: '1px solid var(--vscode-widget-border)',
    borderRadius: 4,
  },
  applyBtn: { alignSelf: 'flex-start', padding: '6px 10px', cursor: 'pointer' },
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
  },
  btn: { padding: '8px 12px', cursor: 'pointer', flexShrink: 0 },
};

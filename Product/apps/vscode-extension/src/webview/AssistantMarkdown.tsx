import type { CSSProperties } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

const markdownComponents: Components = {
  pre({ children }) {
    return <pre style={styles.codeBlockPre}>{children}</pre>;
  },
  code({ className, children, ...props }) {
    const isBlock = Boolean(className);
    if (!isBlock) {
      return (
        <code style={styles.inlineCode} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className={className} style={styles.codeBlockCode} {...props}>
        {children}
      </code>
    );
  },
};

type Props = { text: string };

/** Renders assistant chat text as Markdown (streaming-safe: re-renders on each text update). */
export function AssistantMarkdown({ text }: Props): JSX.Element {
  return (
    <div className="local-ai-markdown" style={styles.markdownBody}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  markdownBody: {
    fontSize: 13,
    lineHeight: 1.5,
    wordBreak: 'break-word',
  },
  inlineCode: {
    fontFamily: 'var(--vscode-editor-font-family)',
    fontSize: '0.92em',
    background: 'var(--vscode-textCodeBlock-background)',
    padding: '0.1em 0.35em',
    borderRadius: 3,
  },
  codeBlockPre: {
    margin: '8px 0',
    padding: 8,
    overflow: 'auto',
    maxHeight: 320,
    background: 'var(--vscode-textCodeBlock-background)',
    border: '1px solid var(--vscode-widget-border)',
    borderRadius: 6,
  },
  codeBlockCode: {
    fontFamily: 'var(--vscode-editor-font-family)',
    fontSize: 'var(--vscode-editor-font-size)',
    whiteSpace: 'pre-wrap',
  },
};

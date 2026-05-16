/** Heuristic file outline (no LSP / embedding). */

const MAX_BACKGROUND_CHARS = 4_000;
const MAX_BACKGROUND_LINES = 80;
/** Optional tail excerpt for file-overview (kept small so outline dominates). */
export const MAX_OVERVIEW_OPTIONAL_EXCERPT_CHARS = 1_200;
const MAX_KEY_SECTION_LINES = 35;
const MAX_METHODS_PER_CLASS = 24;

export type ClassOutline = {
  name: string;
  line: number;
  methods: Array<{ name: string; line: number }>;
};

export type FileOutlineData = {
  rel: string;
  imports: Array<{ line: number; text: string }>;
  exports: Array<{ line: number; text: string }>;
  activation: Array<{ line: number; text: string }>;
  classes: ClassOutline[];
  topLevelFunctions: Array<{ line: number; text: string }>;
  messageHandlers: Array<{ line: number; text: string }>;
};

function isSkippableLine(line: string): boolean {
  const t = line.trim();
  return t.length === 0 || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

function pushUniqueLine(
  list: Array<{ line: number; text: string }>,
  line: number,
  text: string,
  max: number,
): void {
  if (list.length >= max) {
    return;
  }
  const t = text.trim();
  if (t.length === 0) {
    return;
  }
  list.push({ line, text: t });
}

export function buildFileOutlineData(text: string, rel: string): FileOutlineData {
  const lines = text.split(/\r?\n/);
  const imports: FileOutlineData['imports'] = [];
  const exports: FileOutlineData['exports'] = [];
  const activation: FileOutlineData['activation'] = [];
  const topLevelFunctions: FileOutlineData['topLevelFunctions'] = [];
  const messageHandlers: FileOutlineData['messageHandlers'] = [];
  const classes: ClassOutline[] = [];

  let currentClass: ClassOutline | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineNo = i + 1;

    if (isSkippableLine(line)) {
      continue;
    }

    if (/^import\s/.test(trimmed) || /^import\{/.test(trimmed)) {
      pushUniqueLine(imports, lineNo, trimmed, 40);
      continue;
    }

    if (/^(?:export\s+)?(?:async\s+)?function\s+(activate|deactivate)\b/.test(trimmed)) {
      pushUniqueLine(activation, lineNo, trimmed, 6);
    }

    if (
      /^(?:export\s+)?(?:async\s+)?function\s+\w+/.test(trimmed) &&
      !/^(?:export\s+)?(?:async\s+)?function\s+(activate|deactivate)\b/.test(trimmed)
    ) {
      if (/^export\s/.test(trimmed)) {
        pushUniqueLine(exports, lineNo, trimmed, 40);
      }
      pushUniqueLine(topLevelFunctions, lineNo, trimmed, 30);
      currentClass = null;
      continue;
    }

    if (/^export\s+(?:async\s+)?(?:function|const|class)\s+/.test(trimmed) && !/^export\s+class/.test(trimmed)) {
      pushUniqueLine(exports, lineNo, trimmed, 40);
    }

    const classMatch = /^(?:export\s+)?class\s+(\w+)/.exec(trimmed);
    if (classMatch) {
      if (/^export\s+class/.test(trimmed)) {
        pushUniqueLine(exports, lineNo, trimmed, 40);
      }
      currentClass = { name: classMatch[1], line: lineNo, methods: [] };
      classes.push(currentClass);
      continue;
    }

    if (/^export\s+interface\s+/.test(trimmed)) {
      pushUniqueLine(exports, lineNo, trimmed, 40);
      currentClass = null;
      continue;
    }

    if (currentClass) {
      const methodMatch = /^\s+(?:public\s+|private\s+|protected\s+|async\s+)*(\w+)\s*\(/.exec(line);
      if (methodMatch && methodMatch[1] !== 'constructor') {
        if (currentClass.methods.length < MAX_METHODS_PER_CLASS) {
          currentClass.methods.push({ name: methodMatch[1], line: lineNo });
        }
      }
      if (/^\s*\}\s*$/.test(line) && !line.trimStart().startsWith('}')) {
        // ignore
      }
    }

    if (
      /onDidReceiveMessage|\.type\s*===|case\s+['"]|if\s*\(\s*raw\.type|switch\s*\(\s*raw\.type/i.test(
        trimmed,
      )
    ) {
      pushUniqueLine(messageHandlers, lineNo, trimmed, 30);
    }
  }

  return { rel, imports, exports, activation, classes, topLevelFunctions, messageHandlers };
}

function formatOutlineList(title: string, items: Array<{ line: number; text: string }>): string[] {
  if (items.length === 0) {
    return [];
  }
  const out = [`### ${title}`];
  for (const item of items) {
    out.push(`- L${item.line}: ${item.text}`);
  }
  return out;
}

export function formatFileOutlineMarkdown(data: FileOutlineData): string {
  const parts: string[] = ['## File Outline', ''];

  parts.push(...formatOutlineList('Imports', data.imports), '');
  parts.push(...formatOutlineList('Exported functions / constants', data.exports), '');

  if (data.activation.length > 0) {
    parts.push(...formatOutlineList('activate / deactivate', data.activation), '');
  }

  if (data.topLevelFunctions.length > 0) {
    parts.push(...formatOutlineList('Top-level functions', data.topLevelFunctions), '');
  }

  if (data.classes.length > 0) {
    parts.push('### Classes');
    for (const c of data.classes) {
      parts.push(`- ${c.name} (L${c.line})`);
      for (const m of c.methods) {
        parts.push(`  - ${m.name} (L${m.line})`);
      }
    }
    parts.push('');
  }

  if (data.messageHandlers.length > 0) {
    parts.push(...formatOutlineList('Message handler branches', data.messageHandlers), '');
  }

  return parts.join('\n').trimEnd();
}

function extractRangeSnippet(text: string, centerLine: number, halfWindow: number): string {
  const lines = text.split(/\r?\n/);
  const idx = Math.max(0, centerLine - 1);
  const start = Math.max(0, idx - halfWindow);
  const end = Math.min(lines.length - 1, idx + halfWindow);
  return lines.slice(start, end + 1).join('\n');
}

/** Key definition / handler snippets for architecture questions. */
export function buildKeySectionsSnippet(text: string, data: FileOutlineData): string {
  const sections: string[] = ['## Key sections', ''];
  const seen = new Set<number>();

  const addSection = (label: string, line: number): void => {
    if (line <= 0 || seen.has(line)) {
      return;
    }
    seen.add(line);
    sections.push(`### ${label} (around L${line})`, '```ts', extractRangeSnippet(text, line, MAX_KEY_SECTION_LINES), '```', '');
  };

  for (const a of data.activation) {
    addSection('activate/deactivate', a.line);
  }
  for (const c of data.classes.slice(0, 3)) {
    addSection(`class ${c.name}`, c.line);
  }
  for (const h of data.messageHandlers.slice(0, 4)) {
    addSection('message handler', h.line);
  }
  if (data.topLevelFunctions.length > 0 && sections.length <= 4) {
    addSection('top-level function', data.topLevelFunctions[0].line);
  }

  if (sections.length <= 2) {
    return '';
  }
  return sections.join('\n').trimEnd();
}

export function truncateBackgroundFileContent(text: string): string {
  const lines = text.split(/\r?\n/);
  let out = lines.slice(0, MAX_BACKGROUND_LINES).join('\n');
  if (out.length > MAX_BACKGROUND_CHARS) {
    out = out.slice(0, MAX_BACKGROUND_CHARS);
  }
  return out;
}

/** Small optional excerpt at end of file-overview [File Match] (1000–1500 chars). */
export function truncateOverviewOptionalExcerpt(
  text: string,
  maxChars: number = MAX_OVERVIEW_OPTIONAL_EXCERPT_CHARS,
): string {
  const cap = Math.min(Math.max(maxChars, 1_000), 1_500);
  if (text.length <= cap) {
    return text;
  }
  return text.slice(0, cap);
}

/** Whether the user explicitly wants the entire file verbatim in context. */
export function wantsFullFileContent(question: string): boolean {
  return (
    /整檔|完整檔案|完整文件|full\s+file|entire\s+file|whole\s+file|全部內容|完整内容|完整內容/i.test(
      question,
    ) || /read\s+(?:the\s+)?entire/i.test(question)
  );
}

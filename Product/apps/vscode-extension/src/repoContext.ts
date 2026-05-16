import * as vscode from 'vscode';
import {
  buildFileOutlineData,
  buildKeySectionsSnippet,
  formatFileOutlineMarkdown,
  truncateBackgroundFileContent,
} from './fileOutline';

const MAX_FIND_FILES = 800;
const MAX_SYMBOL_MATCHES = 5;
const SYMBOL_CONTEXT_LINES = 40;

const EXCLUDED_DIR_NAMES = new Set(['node_modules', '.git', 'dist', 'out', 'build', 'coverage']);
const WORKSPACE_EXCLUDE_GLOB = '**/{node_modules,.git,dist,out,build,coverage}/**';

const MAX_FILE_CONTEXT_CHARS = 12_000;
const MAX_FILE_CONTEXT_LINES = 300;

const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.vue',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.cs',
  '.cpp',
  '.c',
  '.h',
  '.hpp',
  '.md',
  '.json',
]);

const REPO_KEYWORD_TRIGGERS = [
  '哪裡',
  '哪里',
  'where',
  '定義',
  '定义',
  'definition',
  'function',
  'component',
];

const TERM_STOP_WORDS = new Set([
  'where',
  'the',
  'and',
  'or',
  'for',
  'with',
  'from',
  'this',
  'that',
  'what',
  'which',
  'how',
  'function',
  'component',
  'definition',
  '哪裡',
  '哪里',
  '定義',
  '定义',
  '請',
  '問',
  '是',
  '在',
  '的',
  '嗎',
  '吗',
]);

/** Definition hits score far above any filename heuristic. */
const DEFINITION_SCORE_BASE = 10_000;

type DefinitionHit = {
  line: number;
  definitionLine: string;
  patternIndex: number;
  patternScore: number;
};

export type SymbolMatch = {
  uri: vscode.Uri;
  rel: string;
  symbolName: string;
  line: number;
  definitionLine: string;
  snippet: string;
  score: number;
};

export type FileMatch = {
  uri: vscode.Uri;
  rel: string;
  fileName: string;
  outlineMarkdown: string;
  keySections: string;
  backgroundSnippet: string;
  score: number;
};

export type FileMatchFormatMode = 'overview-primary' | 'compact';

/** camelCase / PascalCase identifiers (case preserved). */
export function extractSymbolNames(question: string): string[] {
  const names = new Set<string>();
  for (const m of question.match(/[A-Za-z_][\w]*/g) ?? []) {
    if (m.length < 3) {
      continue;
    }
    const lower = m.toLowerCase();
    if (TERM_STOP_WORDS.has(lower)) {
      continue;
    }
    if (REPO_KEYWORD_TRIGGERS.some((t) => lower === t.toLowerCase())) {
      continue;
    }
    const isCamelCase = /^[a-z][\w]*[A-Z]/.test(m);
    const isPascalCase = /^[A-Z][\w]*/.test(m) && /[a-z]/.test(m);
    if (isCamelCase || isPascalCase) {
      names.add(m);
    }
  }
  return [...names].sort((a, b) => b.length - a.length);
}

/** Keyword triggers (where / definition / …). */
export function hasRepoKeywordTrigger(question: string): boolean {
  const lower = question.toLowerCase();
  return REPO_KEYWORD_TRIGGERS.some((t) => {
    const tl = t.toLowerCase();
    return lower.includes(tl) || question.includes(t);
  });
}

/** Symbol tokens or keyword triggers → run repo search. */
export function needsRepoContextSearch(question: string): boolean {
  return extractSymbolNames(question).length > 0 || hasRepoKeywordTrigger(question);
}

function isExcludedPath(uri: vscode.Uri): boolean {
  if (uri.scheme !== 'file') {
    return true;
  }
  const parts = uri.fsPath.replace(/\\/g, '/').split('/');
  return parts.some((seg) => EXCLUDED_DIR_NAMES.has(seg));
}

function isSourceFile(uri: vscode.Uri): boolean {
  const base = uri.fsPath.replace(/\\/g, '/').split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  const ext = dot >= 0 ? base.slice(dot).toLowerCase() : '';
  return SOURCE_EXTENSIONS.has(ext);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SOURCE_GLOBS = [
  '**/src/**/*.ts',
  '**/src/**/*.tsx',
  '**/src/**/*.js',
  '**/src/**/*.jsx',
  '**/*.ts',
  '**/*.tsx',
  '**/*.js',
  '**/*.jsx',
];

/** Lists workspace source files; src/** globs first so symbol scan reaches app code. */
export async function listWorkspaceFiles(): Promise<vscode.Uri[]> {
  const seen = new Set<string>();
  const uris: vscode.Uri[] = [];
  for (const pattern of SOURCE_GLOBS) {
    const batch = await vscode.workspace.findFiles(pattern, WORKSPACE_EXCLUDE_GLOB, MAX_FIND_FILES);
    for (const u of batch) {
      const key = u.toString();
      if (seen.has(key) || isExcludedPath(u) || !isSourceFile(u)) {
        continue;
      }
      seen.add(key);
      uris.push(u);
    }
  }
  uris.sort((a, b) => {
    const ar = vscode.workspace.asRelativePath(a, false).replace(/\\/g, '/');
    const br = vscode.workspace.asRelativePath(b, false).replace(/\\/g, '/');
    const aSrc = ar.includes('/src/') || ar.startsWith('src/') ? 0 : 1;
    const bSrc = br.includes('/src/') || br.startsWith('src/') ? 0 : 1;
    if (aSrc !== bSrc) {
      return aSrc - bSrc;
    }
    return ar.localeCompare(br);
  });
  return uris;
}

function prioritizeUrisForSymbol(uris: vscode.Uri[], symbol: string): vscode.Uri[] {
  const hint = symbol.toLowerCase();
  return [...uris].sort((a, b) => {
    const ar = vscode.workspace.asRelativePath(a, false).toLowerCase();
    const br = vscode.workspace.asRelativePath(b, false).toLowerCase();
    const aHit = ar.includes(hint) ? 0 : 1;
    const bHit = br.includes(hint) ? 0 : 1;
    return aHit - bHit;
  });
}

type DefinitionPatternSpec = {
  patternIndex: number;
  patternScore: number;
  build: (escapedSymbol: string) => RegExp;
};

/** Line-anchored definition patterns only (priority high → low). */
function getDefinitionPatternSpecs(symbol: string): DefinitionPatternSpec[] {
  const esc = escapeRegExp(symbol);
  return [
    {
      patternIndex: 0,
      patternScore: 100,
      build: () => new RegExp(`^\\s*export\\s+async\\s+function\\s+${esc}\\b`),
    },
    {
      patternIndex: 1,
      patternScore: 99,
      build: () => new RegExp(`^\\s*export\\s+function\\s+${esc}\\b`),
    },
    {
      patternIndex: 2,
      patternScore: 98,
      build: () => new RegExp(`^\\s*async\\s+function\\s+${esc}\\b`),
    },
    {
      patternIndex: 3,
      patternScore: 97,
      build: () => new RegExp(`^\\s*function\\s+${esc}\\b`),
    },
    {
      patternIndex: 4,
      patternScore: 96,
      build: () => new RegExp(`^\\s*export\\s+const\\s+${esc}\\s*=`),
    },
    {
      patternIndex: 5,
      patternScore: 95,
      build: () => new RegExp(`^\\s*const\\s+${esc}\\s*=`),
    },
    {
      patternIndex: 6,
      patternScore: 94,
      build: () => new RegExp(`^\\s*export\\s+class\\s+${esc}\\b`),
    },
    {
      patternIndex: 7,
      patternScore: 93,
      build: () => new RegExp(`^\\s*class\\s+${esc}\\b`),
    },
    {
      patternIndex: 8,
      patternScore: 92,
      build: () => new RegExp(`^\\s*export\\s+interface\\s+${esc}\\b`),
    },
    {
      patternIndex: 9,
      patternScore: 91,
      build: () => new RegExp(`^\\s*interface\\s+${esc}\\b`),
    },
  ];
}

function isSkippableSourceLine(line: string): boolean {
  const t = line.trim();
  if (t.length === 0) {
    return true;
  }
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.endsWith('*/')) {
    return true;
  }
  return false;
}

/** Scan line-by-line for a definition-only match (no whole-file / usage false positives). */
function findSymbolDefinitionInFile(text: string, symbol: string): DefinitionHit | null {
  const patterns = getDefinitionPatternSpecs(symbol);
  const lines = text.split(/\r?\n/);
  let best: DefinitionHit | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isSkippableSourceLine(line)) {
      continue;
    }
    const trimmed = line.trim();
    if (/^\s*import\b/.test(trimmed) || /^\s*export\s*\{/.test(trimmed)) {
      continue;
    }
    for (const spec of patterns) {
      if (!spec.build(symbol).test(line)) {
        continue;
      }
      const hit: DefinitionHit = {
        line: i + 1,
        definitionLine: line.trimEnd(),
        patternIndex: spec.patternIndex,
        patternScore: spec.patternScore,
      };
      if (!best || spec.patternIndex < best.patternIndex) {
        best = hit;
      }
      break;
    }
    if (best?.patternIndex === 0) {
      break;
    }
  }
  return best;
}

async function readFileText(uri: vscode.Uri): Promise<string> {
  const bytes = await vscode.workspace.fs.readFile(uri);
  return new TextDecoder('utf-8').decode(bytes);
}

function extractLineContext(text: string, line: number): string {
  const lines = text.split(/\r?\n/);
  const start = Math.max(0, line - SYMBOL_CONTEXT_LINES);
  const end = Math.min(lines.length - 1, line + SYMBOL_CONTEXT_LINES);
  return lines.slice(start, end + 1).join('\n');
}

function filePathBonus(rel: string, symbol: string): number {
  const lower = rel.replace(/\\/g, '/').toLowerCase();
  const sym = symbol.toLowerCase();
  let bonus = 0;
  if (lower.includes(sym)) {
    bonus += 40;
  }
  if (lower.includes('/prompts/') || lower.includes('/src/')) {
    bonus += 5;
  }
  return bonus;
}

function fenceLangForPath(relPath: string): string {
  const ext = relPath.replace(/\\/g, '/').split('/').pop()?.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'ts',
    tsx: 'tsx',
    js: 'js',
    jsx: 'jsx',
    mjs: 'js',
    cjs: 'js',
    vue: 'vue',
    py: 'python',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    cs: 'csharp',
    cpp: 'cpp',
    c: 'c',
    h: 'c',
    hpp: 'cpp',
    md: 'md',
    json: 'json',
  };
  return map[ext] ?? '';
}

/** Find definition-only matches for explicit or auto symbol names. */
export async function findSymbolDefinitions(symbols: string[]): Promise<SymbolMatch[]> {
  return findSymbolMatches(symbols);
}

async function findSymbolMatches(symbols: string[]): Promise<SymbolMatch[]> {
  if (symbols.length === 0) {
    return [];
  }
  const uris = await listWorkspaceFiles();
  const results: SymbolMatch[] = [];

  for (const symbol of symbols) {
    if (results.length >= MAX_SYMBOL_MATCHES) {
      break;
    }
    let best: SymbolMatch | null = null;
    for (const uri of prioritizeUrisForSymbol(uris, symbol)) {
      try {
        const text = await readFileText(uri);
        const hit = findSymbolDefinitionInFile(text, symbol);
        if (!hit) {
          continue;
        }
        const rel = vscode.workspace.asRelativePath(uri, false);
        const score = DEFINITION_SCORE_BASE + hit.patternScore + filePathBonus(rel, symbol);
        const candidate: SymbolMatch = {
          uri,
          rel,
          symbolName: symbol,
          line: hit.line,
          definitionLine: hit.definitionLine,
          snippet: extractLineContext(text, hit.line - 1),
          score,
        };
        if (!best || candidate.score > best.score) {
          best = candidate;
        }
        if (hit.patternIndex <= 1) {
          break;
        }
      } catch {
        // skip unreadable
      }
    }
    if (best) {
      results.push(best);
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

export function formatSymbolMatches(matches: SymbolMatch[]): string {
  const blocks: string[] = [];
  for (const m of matches) {
    const lang = fenceLangForPath(m.rel);
    const fence = lang.length > 0 ? lang : 'text';
    blocks.push(
      '[Symbol Match]',
      `File: ${m.rel}`,
      `Symbol: ${m.symbolName}`,
      `Line: ${m.line}`,
      `Definition: ${m.definitionLine}`,
      '',
      '```' + fence,
      m.snippet,
      '```',
    );
  }
  return blocks.join('\n');
}

function scoreFileCandidateRel(rel: string): number {
  const p = rel.replace(/\\/g, '/').toLowerCase();
  if (
    p.includes('node_modules') ||
    p.includes('/out/') ||
    p.includes('/dist/') ||
    p.includes('/build/') ||
    p.includes('/coverage/') ||
    p.includes('/.git/')
  ) {
    return -10_000;
  }
  let score = 0;
  if (p.includes('apps/vscode-extension/src/')) {
    score += 200;
  } else if (p.includes('/src/')) {
    score += 150;
  }
  return score;
}

function buildFileMatchFromText(uri: vscode.Uri, rel: string, fileName: string, text: string): FileMatch {
  const outlineData = buildFileOutlineData(text, rel);
  return {
    uri,
    rel,
    fileName,
    outlineMarkdown: formatFileOutlineMarkdown(outlineData),
    keySections: buildKeySectionsSnippet(text, outlineData),
    backgroundSnippet: truncateBackgroundFileContent(text),
    score: scoreFileCandidateRel(rel),
  };
}

/** Resolve @filename to best workspace file (prefers src/, excludes out/vendor). */
export async function findFileByName(fileName: string): Promise<FileMatch | null> {
  const normalized = fileName.replace(/^@/, '').trim();
  if (normalized.length === 0) {
    return null;
  }
  const lower = normalized.toLowerCase();
  const byGlob = await vscode.workspace.findFiles(
    `**/${normalized}`,
    WORKSPACE_EXCLUDE_GLOB,
    50,
  );
  const fromList = await listWorkspaceFiles();
  const seen = new Set<string>();
  const candidates: vscode.Uri[] = [];
  for (const u of [...byGlob, ...fromList]) {
    const key = u.toString();
    if (seen.has(key) || isExcludedPath(u)) {
      continue;
    }
    const base = u.fsPath.replace(/\\/g, '/').split('/').pop() ?? '';
    if (base.toLowerCase() !== lower) {
      continue;
    }
    seen.add(key);
    candidates.push(u);
  }
  if (candidates.length === 0) {
    return null;
  }
  candidates.sort((a, b) => {
    const ar = vscode.workspace.asRelativePath(a, false);
    const br = vscode.workspace.asRelativePath(b, false);
    return scoreFileCandidateRel(br) - scoreFileCandidateRel(ar);
  });
  const uri = candidates[0];
  const rel = vscode.workspace.asRelativePath(uri, false);
  try {
    const text = await readFileText(uri);
    return buildFileMatchFromText(uri, rel, normalized, text);
  } catch {
    return null;
  }
}

export async function findFileMatches(fileNames: string[]): Promise<FileMatch[]> {
  const results: FileMatch[] = [];
  const seen = new Set<string>();
  for (const name of fileNames) {
    const hit = await findFileByName(name);
    if (!hit) {
      continue;
    }
    const key = hit.uri.toString();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    results.push(hit);
  }
  return results.sort((a, b) => b.score - a.score);
}

function formatSingleFileMatch(m: FileMatch, mode: FileMatchFormatMode): string {
  const lang = fenceLangForPath(m.rel);
  const fence = lang.length > 0 ? lang : 'text';
  const parts: string[] = ['[File Match]', `File: ${m.rel}`, ''];

  if (mode === 'overview-primary') {
    parts.push(m.outlineMarkdown, '');
    if (m.keySections.length > 0) {
      parts.push(m.keySections, '');
    }
    parts.push(
      '### Raw file excerpt (background, truncated)',
      '```' + fence,
      m.backgroundSnippet,
      '```',
    );
  } else {
    parts.push(m.outlineMarkdown, '');
    parts.push(
      '### Raw file excerpt (background, truncated)',
      '```' + fence,
      m.backgroundSnippet,
      '```',
    );
  }

  return parts.join('\n');
}

export function formatFileMatches(matches: FileMatch[], mode: FileMatchFormatMode = 'overview-primary'): string {
  return matches.map((m) => formatSingleFileMatch(m, mode)).join('\n\n');
}

/** file-overview → outline + key sections primary; other intents → compact outline. */
export function formatFileMatchesForIntent(
  matches: FileMatch[],
  intent: 'file-overview' | 'symbol-lifecycle' | 'symbol-explanation' | 'definition-lookup',
): string {
  const mode: FileMatchFormatMode = intent === 'file-overview' ? 'overview-primary' : 'compact';
  return formatFileMatches(matches, mode);
}

/** Build outline + optional background for active editor (general chat). */
export function buildEditorFileContext(
  text: string,
  rel: string,
  includeBackground: boolean,
): { outline: string; background: string } {
  const match = buildFileMatchFromText(vscode.Uri.file(rel), rel, rel.split('/').pop() ?? rel, text);
  const outlineParts = [match.outlineMarkdown];
  if (match.keySections.length > 0) {
    outlineParts.push('', match.keySections);
  }
  return {
    outline: outlineParts.join('\n'),
    background: includeBackground ? match.backgroundSnippet : '',
  };
}

/**
 * Builds repo context for chat: symbol definitions first (exact regex scan).
 * When any symbol hits, returns only symbol blocks (no filename fuzzy summary).
 */
export async function buildRepoContextSection(question: string): Promise<string> {
  const symbols = extractSymbolNames(question);
  const keyword = hasRepoKeywordTrigger(question);
  console.log('[Local AI][repo] buildRepoContextSection', { question, symbols, keyword });

  if (!needsRepoContextSearch(question)) {
    console.log('[Local AI][repo] skip: needsRepoContextSearch=false');
    return '';
  }
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    console.log('[Local AI][repo] skip: no workspace folder');
    return '';
  }

  if (symbols.length > 0) {
    const uris = await listWorkspaceFiles();
    console.log('[Local AI][repo] scanning files:', uris.length, 'workspace:', folders[0].uri.fsPath);
    const matches = await findSymbolMatches(symbols);
    console.log(
      '[Local AI][repo] symbol matches:',
      matches.map((m) => ({ file: m.rel, symbol: m.symbolName, line: m.line })),
    );
    if (matches.length > 0) {
      const block = formatSymbolMatches(matches);
      console.log('[Local AI][repo] block has [Symbol Match]:', block.includes('[Symbol Match]'));
      return block;
    }
    console.log('[Local AI][repo] no symbol definition found for:', symbols);
  }

  return '';
}

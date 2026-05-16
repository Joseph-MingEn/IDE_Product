import * as vscode from 'vscode';
import {
  buildRepoContextSection,
  findFileMatches,
  findSymbolDefinitions,
  formatFileMatchesForIntent,
  formatSymbolMatches,
} from '../repoContext';
import type { ExplicitIntent } from './explicitIntent';

/** Section label when repo excerpts are attached to a chat user message. */
export const REPO_CONTEXT_SECTION_LABEL = 'Repo Context (workspace — auto-matched excerpts)';

/** Parsed @symbol / @file tokens from the user question. */
export type ExplicitContextRefs = {
  symbols: string[];
  files: string[];
};

const EXPLICIT_FILE_REF = /\.[a-zA-Z][\w]{0,15}$/;

function isExplicitSymbolToken(token: string): boolean {
  if (token.length < 2) {
    return false;
  }
  const isCamelCase = /^[a-z][\w]*[A-Z]/.test(token);
  const isPascalCase = /^[A-Z][\w]*/.test(token) && /[a-z]/.test(token);
  return isCamelCase || isPascalCase;
}

/**
 * Extract @NAME refs from the question.
 * - @file.ts → files
 * - @buildChatUserMessage / @ChatViewProvider → symbols
 */
export function extractExplicitContextRefs(question: string): ExplicitContextRefs {
  const symbols = new Set<string>();
  const files = new Set<string>();
  const re = /@([A-Za-z_][\w.]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(question)) !== null) {
    const token = m[1];
    if (EXPLICIT_FILE_REF.test(token)) {
      files.add(token);
    } else if (isExplicitSymbolToken(token)) {
      symbols.add(token);
    }
  }
  const refs = { symbols: [...symbols], files: [...files] };
  console.log('[Local AI][repo] explicit refs:', refs);
  console.log('[Local AI][repo] explicit symbol refs:', refs.symbols);
  console.log('[Local AI][repo] explicit file refs:', refs.files);
  return refs;
}

export function hasExplicitContextRefs(question: string): boolean {
  const refs = extractExplicitContextRefs(question);
  return refs.symbols.length > 0 || refs.files.length > 0;
}

export type ExplicitContextParts = {
  symbolBlock: string;
  fileBlock: string;
};

/** Fetch [Symbol Match] and [File Match] blocks separately for intent-based ordering. */
export async function fetchExplicitContextParts(
  refs: ExplicitContextRefs,
  intent: ExplicitIntent,
): Promise<ExplicitContextParts> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return { symbolBlock: '', fileBlock: '' };
  }

  let symbolBlock = '';
  let fileBlock = '';

  if (refs.symbols.length > 0) {
    const symbolMatches = await findSymbolDefinitions(refs.symbols);
    console.log(
      '[Local AI][repo] explicit symbol matches:',
      symbolMatches.map((s) => ({ file: s.rel, symbol: s.symbolName, line: s.line })),
    );
    if (symbolMatches.length > 0) {
      symbolBlock = formatSymbolMatches(symbolMatches);
    }
  }

  if (refs.files.length > 0) {
    const fileMatches = await findFileMatches(refs.files);
    console.log(
      '[Local AI][repo] explicit file matches:',
      fileMatches.map((f) => f.rel),
    );
    if (fileMatches.length > 0) {
      fileBlock = formatFileMatchesForIntent(fileMatches, intent);
      console.log('[Local AI][repo] file context mode:', intent === 'file-overview' ? 'outline-primary' : 'compact');
    }
  }

  return { symbolBlock, fileBlock };
}

/** Build combined explicit context (default: symbol blocks before file blocks). */
export async function fetchExplicitContextBlock(
  refs: ExplicitContextRefs,
  intent: ExplicitIntent = 'file-overview',
): Promise<string> {
  const { symbolBlock, fileBlock } = await fetchExplicitContextParts(refs, intent);
  const block = [symbolBlock, fileBlock].filter((s) => s.length > 0).join('\n\n');
  console.log('[Local AI][repo] explicit context block length:', block.length);
  return block;
}

/**
 * Fetches workspace repo context: explicit @ refs first, else auto symbol search.
 */
export async function fetchRepoContextBlock(question: string): Promise<string> {
  console.log('[Local AI][repo] fetchRepoContextBlock called:', question);
  const refs = extractExplicitContextRefs(question);
  if (refs.symbols.length > 0 || refs.files.length > 0) {
    const block = await fetchExplicitContextBlock(refs);
    console.log('[Local AI][repo] fetchRepoContextBlock (explicit) length:', block.length);
    return block;
  }
  const block = await buildRepoContextSection(question);
  console.log('[Local AI][repo] fetchRepoContextBlock (auto) length:', block.length);
  return block;
}

export function repoBlockHasSymbolMatch(repoBlock: string): boolean {
  return repoBlock.includes('[Symbol Match]');
}

export function repoBlockHasExplicitContext(repoBlock: string): boolean {
  return repoBlock.includes('[Symbol Match]') || repoBlock.includes('[File Match]');
}

/** Appends a non-empty repo context block to a user-message parts array. */
export function appendRepoContextParts(parts: string[], repoBlock: string): void {
  if (repoBlock.length === 0) {
    return;
  }
  parts.push('', repoBlock);
}

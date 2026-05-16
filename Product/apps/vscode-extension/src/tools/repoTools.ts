import * as vscode from 'vscode';
import {
  buildEditorFileContext,
  findFileByName,
  findSymbolDefinitions,
  type FileMatch,
  type SymbolMatch,
} from '../repoContext';
import type { Tool, ToolContext, ToolExecutionResult } from './types';
import { toolFailure, toolSuccess } from './types';

export type FindSymbolArgs = { symbol: string };
export type FindSymbolData = { matches: SymbolMatchSummary[]; formatted: string };

export type ResolveFileArgs = { fileName: string };
export type ResolveFileData = { match: FileMatchSummary | null };

export type ReadFileOutlineArgs = {
  fileName?: string;
  includeBackground?: boolean;
};
export type ReadFileOutlineData = {
  rel: string;
  languageId: string;
  outline: string;
  background: string;
};

export type SymbolMatchSummary = {
  rel: string;
  symbolName: string;
  line: number;
  definitionLine: string;
  snippet: string;
};

export type FileMatchSummary = {
  rel: string;
  fileName: string;
  score: number;
  hasOutline: boolean;
  hasKeySections: boolean;
};

function summarizeSymbol(m: SymbolMatch): SymbolMatchSummary {
  return {
    rel: m.rel,
    symbolName: m.symbolName,
    line: m.line,
    definitionLine: m.definitionLine,
    snippet: m.snippet,
  };
}

function summarizeFile(m: FileMatch): FileMatchSummary {
  return {
    rel: m.rel,
    fileName: m.fileName,
    score: m.score,
    hasOutline: m.outlineMarkdown.trim().length > 0,
    hasKeySections: m.keySections.trim().length > 0,
  };
}

function formatSymbolBlock(matches: SymbolMatch[]): string {
  if (matches.length === 0) {
    return '';
  }
  const lines: string[] = [];
  for (const m of matches) {
    lines.push(
      `[${m.symbolName}] ${m.rel}:${m.line}`,
      m.definitionLine,
      m.snippet,
      '',
    );
  }
  return lines.join('\n').trimEnd();
}

function requireString(value: unknown, field: string): string | ToolFailure {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return toolFailure(`"${field}" must be a non-empty string`);
  }
  return value.trim();
}

export const findSymbolTool: Tool<FindSymbolArgs, FindSymbolData> = {
  name: 'find_symbol',
  description: 'Search the workspace for a symbol definition (regex scan, same as repo symbol search).',
  parameters: {
    type: 'object',
    properties: {
      symbol: { type: 'string', description: 'CamelCase or PascalCase symbol name' },
    },
    required: ['symbol'],
  },
  async execute(args, _ctx: ToolContext): Promise<ToolExecutionResult<FindSymbolData>> {
    const symbol = requireString(args.symbol, 'symbol');
    if (typeof symbol !== 'string') {
      return symbol;
    }
    const matches = await findSymbolDefinitions([symbol]);
    const summaries = matches.map(summarizeSymbol);
    const formatted = formatSymbolBlock(matches);
    const text =
      summaries.length === 0
        ? `No definition found for "${symbol}".`
        : `Found ${summaries.length} match(es) for "${symbol}".`;
    return toolSuccess({ matches: summaries, formatted }, text);
  },
};

export const resolveFileTool: Tool<ResolveFileArgs, ResolveFileData> = {
  name: 'resolve_file',
  description: 'Resolve a filename to the best workspace file (same as @file resolution).',
  parameters: {
    type: 'object',
    properties: {
      fileName: { type: 'string', description: 'Basename e.g. extension.ts' },
    },
    required: ['fileName'],
  },
  async execute(args, _ctx: ToolContext): Promise<ToolExecutionResult<ResolveFileData>> {
    const fileName = requireString(args.fileName, 'fileName');
    if (typeof fileName !== 'string') {
      return fileName;
    }
    const hit = await findFileByName(fileName);
    if (!hit) {
      return toolSuccess({ match: null }, `No workspace file matched "${fileName}".`);
    }
    const summary = summarizeFile(hit);
    return toolSuccess(
      { match: summary },
      `Resolved "${fileName}" → ${summary.rel} (score ${summary.score}).`,
    );
  },
};

export const readFileOutlineTool: Tool<ReadFileOutlineArgs, ReadFileOutlineData> = {
  name: 'read_file_outline',
  description:
    'Return File Outline + Key Sections for a file (or active editor). Does not dump full raw file.',
  parameters: {
    type: 'object',
    properties: {
      fileName: {
        type: 'string',
        description: 'Optional basename; omit to use the active editor file',
      },
      includeBackground: {
        type: 'boolean',
        description: 'Include truncated background excerpt (default false)',
      },
    },
  },
  async execute(args, _ctx: ToolContext): Promise<ToolExecutionResult<ReadFileOutlineData>> {
    const includeBackground = args.includeBackground === true;
    let rel: string;
    let text: string;
    let languageId = 'text';

    if (typeof args.fileName === 'string' && args.fileName.trim().length > 0) {
      const hit = await findFileByName(args.fileName.trim());
      if (!hit) {
        return toolFailure(`No workspace file matched "${args.fileName}".`);
      }
      rel = hit.rel;
      const doc = await vscode.workspace.openTextDocument(hit.uri);
      text = doc.getText();
      languageId = doc.languageId;
    } else {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return toolFailure('No active editor; provide fileName or open a file.');
      }
      rel = vscode.workspace.asRelativePath(editor.document.uri, false);
      text = editor.document.getText();
      languageId = editor.document.languageId;
    }

    const { outline, background } = buildEditorFileContext(text, rel, includeBackground);
    return toolSuccess(
      { rel, languageId, outline, background: includeBackground ? background : '' },
      `Outline for ${rel} (${outline.length} chars).`,
    );
  },
};

/** Tools that only use repoContext / fileOutline heuristics. */
export const repoTools: Tool[] = [findSymbolTool, resolveFileTool, readFileOutlineTool];

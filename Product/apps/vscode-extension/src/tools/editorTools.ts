import * as vscode from 'vscode';
import { buildEditorFileContext } from '../repoContext';
import type { Tool, ToolContext, ToolExecutionResult } from './types';
import { toolFailure, toolSuccess } from './types';

export type ReadSelectionData = {
  filePath: string;
  rel: string;
  languageId: string;
  text: string;
  isEmpty: boolean;
};

export type ReadActiveFileArgs = {
  mode?: 'outline' | 'full';
};

export type ReadActiveFileData = {
  filePath: string;
  rel: string;
  languageId: string;
  mode: 'outline' | 'full';
  outline?: string;
  background?: string;
  fullText?: string;
};

export const readSelectionTool: Tool<Record<string, never>, ReadSelectionData> = {
  name: 'read_selection',
  description: 'Read the current editor selection (empty if none).',
  parameters: { type: 'object', properties: {} },
  async execute(_args, _ctx: ToolContext): Promise<ToolExecutionResult<ReadSelectionData>> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return toolFailure('No active editor.');
    }
    const doc = editor.document;
    const text = doc.getText(editor.selection);
    const rel = vscode.workspace.asRelativePath(doc.uri, false);
    const isEmpty = text.trim().length === 0;
    return toolSuccess(
      {
        filePath: doc.uri.fsPath,
        rel,
        languageId: doc.languageId,
        text,
        isEmpty,
      },
      isEmpty ? `No selection in ${rel}.` : `Selection from ${rel} (${text.length} chars).`,
    );
  },
};

export const readActiveFileTool: Tool<ReadActiveFileArgs, ReadActiveFileData> = {
  name: 'read_active_file',
  description:
    'Read the active editor file as outline (default) or full text. Outline matches chat file-outline mode.',
  parameters: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        description: '"outline" (default) or "full"',
      },
    },
  },
  async execute(args, _ctx: ToolContext): Promise<ToolExecutionResult<ReadActiveFileData>> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return toolFailure('No active editor.');
    }
    const doc = editor.document;
    const rel = vscode.workspace.asRelativePath(doc.uri, false);
    const filePath = doc.uri.fsPath;
    const languageId = doc.languageId;
    const mode: 'outline' | 'full' = args.mode === 'full' ? 'full' : 'outline';

    if (mode === 'full') {
      const fullText = doc.getText();
      return toolSuccess(
        {
          filePath,
          rel,
          languageId,
          mode,
          fullText,
        },
        `Full file ${rel} (${fullText.length} chars).`,
      );
    }

    const { outline, background } = buildEditorFileContext(doc.getText(), rel, false);
    return toolSuccess(
      {
        filePath,
        rel,
        languageId,
        mode,
        outline,
        background: '',
      },
      `Active file outline ${rel} (${outline.length} chars).`,
    );
  },
};

/** Tools that require the VS Code active editor. */
export const editorTools: Tool[] = [readSelectionTool, readActiveFileTool];

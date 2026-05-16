import * as vscode from 'vscode';
import type { ChatMessage } from '../protocol';
import type { OllamaChatMessage } from '../ollama';
import { assembleExplicitRepoBlock, detectExplicitIntent, type ExplicitIntent } from './explicitIntent';
import {
  buildContextSufficiencyPreamble,
  buildExplicitContextContract,
  buildFileOverviewAnswerGuideReminder,
  buildPromptContract,
} from './promptContracts';
import { buildEditorFileContext } from '../repoContext';
import { resolveEditorContextMode } from './editorContextMode';
import {
  logExplicitContextBuildSummary,
  logUserMessagePayloadPreview,
  SKIP_CHAT_HISTORY_FOR_DEBUG,
} from '../debugPayload';
import {
  appendRepoContextParts,
  extractExplicitContextRefs,
  fetchExplicitContextParts,
  fetchRepoContextBlock,
  hasExplicitContextRefs,
  repoBlockHasSymbolMatch,
} from './repoPrompt';

/** Recent turns sent to Ollama for multi-turn chat (current user message included). */
export const MAX_OLLAMA_CHAT_TURNS = 8;

export function getChatSystemPrompt(): string {
  return [
    'You are a local coding assistant inside VS Code.',
    'The user may provide repository context in the message.',
    'Use the provided context as sufficient evidence.',
    'Answer directly in Traditional Chinese unless the user asks otherwise.',
  ].join('\n');
}

/** Answer guide + anti-refusal preamble, then question, then context blocks below. */
function appendQuestionWithRepoContext(
  parts: string[],
  userQuestion: string,
  repoBlock: string,
  guide?: string,
): void {
  if (guide) {
    parts.push('', guide);
  }
  parts.push('', buildContextSufficiencyPreamble(), '', 'User Question:', userQuestion);
  appendRepoContextParts(parts, repoBlock);
}

/** User message when @symbol / @file explicit context is present. */
export function buildExplicitContextUserMessage(
  userQuestion: string,
  repoBlock: string,
  intent: ExplicitIntent,
  hasSymbolMatch: boolean,
  hasFileMatch: boolean,
): string {
  const parts = [
    'Context Mode: explicit-context',
    `Intent: ${intent}`,
    '',
    buildExplicitContextContract(intent, { hasSymbolMatch, hasFileMatch }),
    '',
    'Note: @symbolName and @filename.ts are context selectors (resolved below).',
  ];
  appendQuestionWithRepoContext(parts, userQuestion, repoBlock);
  if (intent === 'file-overview') {
    parts.push('', buildFileOverviewAnswerGuideReminder());
  }
  return parts.join('\n');
}

/** User message for file-outline editor mode (outline primary, optional small background). */
export function buildFileOutlineUserMessage(
  userQuestion: string,
  filePath: string,
  languageId: string,
  outline: string,
  background: string,
  repoBlock: string,
): string {
  const parts = [
    'Context Mode: file-outline',
    '',
    buildPromptContract('file-outline'),
    '',
    buildContextSufficiencyPreamble(),
    '',
    'User Question:',
    userQuestion,
    '',
    'Active File:',
    filePath,
    '',
    'Language:',
    languageId,
    '',
    'Code Context (file outline — PRIMARY):',
    outline,
  ];
  if (background.length > 0) {
    parts.push(
      '',
      '### Background excerpt only — do not summarize from this first.',
      '```' + languageId,
      background,
      '```',
    );
  }
  appendRepoContextParts(parts, repoBlock);
  return parts.join('\n');
}

/** Strict user message when auto repo symbol search hit — no Active File / editor metadata. */
function buildSymbolMatchUserMessage(userQuestion: string, repoBlock: string): string {
  const parts = ['Context Mode: symbol-match'];
  appendQuestionWithRepoContext(parts, userQuestion, repoBlock, buildPromptContract('symbol-match'));
  return parts.join('\n');
}

/**
 * Maps prior chat history + current turn to Ollama messages.
 * system first; up to MAX_OLLAMA_CHAT_TURNS−1 prior user/assistant; current user last (full context).
 * Call before persisting the current user turn to chat history.
 */
export type BuildOllamaChatMessagesOptions = {
  /** When true, omit prior turns (debug / golden tests). */
  skipHistory?: boolean;
};

export function buildOllamaChatMessages(
  priorHistory: ChatMessage[],
  currentUserMessage: string,
  systemInstruction: string = getChatSystemPrompt(),
  options?: BuildOllamaChatMessagesOptions,
): OllamaChatMessage[] {
  const skipHistory = options?.skipHistory ?? SKIP_CHAT_HISTORY_FOR_DEBUG;
  const messages: OllamaChatMessage[] = [{ role: 'system', content: systemInstruction }];

  if (!skipHistory) {
    const priorSlots = Math.max(0, MAX_OLLAMA_CHAT_TURNS - 1);
    const recentPrior = priorHistory.slice(-priorSlots);
    for (const msg of recentPrior) {
      if (msg.role !== 'user' && msg.role !== 'assistant') {
        continue;
      }
      if (msg.role === 'assistant' && msg.text.length === 0) {
        continue;
      }
      messages.push({ role: msg.role, content: msg.text });
    }
  }

  messages.push({ role: 'user', content: currentUserMessage });
  const lastUser = messages[messages.length - 1];
  console.log('[Local AI][payload] buildOllamaChatMessages: count=', messages.length, 'priorSkipped=', skipHistory);
  console.log('[Local AI][payload] last user len=', lastUser.content.length, 'hasFileMatch=', lastUser.content.includes('[File Match]'));
  const intentMatch = /Intent: ([\w-]+)/.exec(lastUser.content);
  if (intentMatch) {
    console.log('[Local AI][payload] explicit Intent:', intentMatch[1]);
  }
  return messages;
}

/**
 * Builds the user-role message: explicit @ context, auto symbol-match, or editor context.
 */
export async function buildChatUserMessage(userQuestion: string): Promise<string> {
  console.log('[Local AI][chat] buildChatUserMessage question:', userQuestion);
  const explicit = hasExplicitContextRefs(userQuestion);

  if (explicit) {
    const refs = extractExplicitContextRefs(userQuestion);
    const shapeProbe = {
      hasSymbolMatch: refs.symbols.length > 0,
      hasFileMatch: refs.files.length > 0,
    };
    const intent = detectExplicitIntent(userQuestion, shapeProbe);
    const { symbolBlock, fileBlock, matchedFilePaths } = await fetchExplicitContextParts(refs, intent);
    const hasSymbolMatch = symbolBlock.includes('[Symbol Match]');
    const hasFileMatch = fileBlock.includes('[File Match]');
    const shape = { hasSymbolMatch, hasFileMatch };
    const repoBlock = assembleExplicitRepoBlock(symbolBlock, fileBlock, intent);
    const out = buildExplicitContextUserMessage(userQuestion, repoBlock, intent, hasSymbolMatch, hasFileMatch);
    logExplicitContextBuildSummary({
      refs,
      matchedFilePaths,
      fileBlockLength: fileBlock.length,
      symbolBlockLength: symbolBlock.length,
      hasFileMatch,
      hasSymbolMatch,
      intent,
      finalUserMessageLength: out.length,
    });
    logUserMessagePayloadPreview(out, 'final user (explicit-context)');
    return out;
  }

  const repoBlock = await fetchRepoContextBlock(userQuestion);
  const hasSymbolMatch = repoBlockHasSymbolMatch(repoBlock);
  console.log('[Local AI][chat] repoBlock length:', repoBlock.length, 'hasSymbolMatch:', hasSymbolMatch);
  if (repoBlock.length > 0) {
    console.log('[Local AI][chat] repoBlock preview:\n', repoBlock.slice(0, 800));
  }

  if (hasSymbolMatch) {
    const out = buildSymbolMatchUserMessage(userQuestion, repoBlock);
    console.log('[Local AI][chat] final user message (symbol-match strict):\n', out);
    return out;
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    const parts = ['Context Mode: no-editor'];
    appendQuestionWithRepoContext(parts, userQuestion, repoBlock);
    const out = parts.join('\n');
    console.log('[Local AI][chat] final user message (no-editor):\n', out);
    return out;
  }

  const doc = editor.document;
  const filePath = doc.uri.fsPath;
  const languageId = doc.languageId;
  const selectedRaw = doc.getText(editor.selection);
  const hasSelection = selectedRaw.trim().length > 0;

  if (hasSelection) {
    const parts = ['Context Mode: selection'];
    appendQuestionWithRepoContext(parts, userQuestion, repoBlock, buildPromptContract('selection'));
    parts.push(
      '',
      'Active File:',
      filePath,
      '',
      'Language:',
      languageId,
      '',
      'Code Context (selection — 請優先分析此段):',
      selectedRaw,
    );
    const out = parts.join('\n');
    console.log('[Local AI][chat] final user message (selection):\n', out);
    return out;
  }

  const rel = vscode.workspace.asRelativePath(doc.uri, false);
  const fullText = doc.getText();
  const mode = resolveEditorContextMode(userQuestion, { hasEditor: true, hasSelection: false });

  if (mode === 'full-file') {
    const parts = [
      'Context Mode: full-file',
      '',
      buildPromptContract('full-file'),
      '',
      buildContextSufficiencyPreamble(),
      '',
      'User Question:',
      userQuestion,
      '',
      'Active File:',
      filePath,
      '',
      'Language:',
      languageId,
      '',
      'Code Context (full file — user requested verbatim):',
      fullText,
    ];
    const out = parts.join('\n');
    console.log('[Local AI][chat] final user message (full-file explicit):\n', out);
    return out;
  }

  const { outline, background } = buildEditorFileContext(fullText, rel, false);
  const out = buildFileOutlineUserMessage(userQuestion, filePath, languageId, outline, background, repoBlock);
  console.log('[Local AI][chat] final user message (file-outline):\n', out);
  return out;
}

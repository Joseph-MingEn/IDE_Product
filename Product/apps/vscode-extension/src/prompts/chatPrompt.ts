import * as vscode from 'vscode';
import type { ChatMessage } from '../protocol';
import type { OllamaChatMessage } from '../ollama';
import {
  assembleExplicitRepoBlock,
  buildExplicitIntentHints,
  detectExplicitIntent,
  type ExplicitIntent,
} from './explicitIntent';
import { wantsFullFileContent } from '../fileOutline';
import { buildEditorFileContext } from '../repoContext';
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

/** System prompt for general chat (coding-focused, allows ordinary questions). */
export function getChatSystemPrompt(): string {
  return [
    '你是運行於 VSCode 的 AI 編程助手，也能回答一般問題。',
    '- 請使用繁體中文回答。',
    '- 當 Context Mode 為 explicit-context 時，嚴格遵守 Intent 與 Explicit intent routing（高於一般習慣）。',
    '  - @xxx 是 context selector，不是普通提問文字。',
    '  - Intent: file-overview → 以 [File Match] 的 File Outline + Key sections 做整檔架構說明；Raw excerpt 僅輔助；禁止只講單一 class。',
    '  - Intent: symbol-lifecycle → [Symbol Match] 為主解釋流程/生命週期；[File Match] 僅說明其在檔案中的位置。',
    '  - Intent: symbol-explanation → [Symbol Match] 為主；[File Match] 僅輔助。',
    '  - Intent: definition-lookup → 第一句 = File + Line + Symbol。',
    '  - [Context priority: PRIMARY] 區塊是主要依據；[BACKGROUND] 僅能簡短補充，不可搶主題。',
    '  - 不要泛泛介紹整個 extension；不要猜測 context 未提供的檔案。',
    '- 當 Context Mode 為 symbol-match 時：',
    '  - [Symbol Match] 為最高優先級；禁止引用 Active File、禁止猜測其他檔案。',
    '- 當 Context Mode 為 file-outline 時：以 File Outline 為主，Raw excerpt 僅輔助。',
    '- 當訊息中含有 [Symbol Match]、[File Match]、Code Context 或其他 Context Mode 時，請優先依據這些內容作答。',
    '- 若訊息未提供某檔案或程式碼，請勿假裝已讀過；可說明需要更多資訊，但仍應盡力回答，避免不必要的拒絕。',
    '- 程式相關問題請給實用、具體的建議；一般對話可簡潔直接回答。',
    '- 避免空泛寒暄。',
  ].join('\n');
}

/** User message when @symbol / @file explicit context is present. */
function buildExplicitContextUserMessage(
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
    buildExplicitIntentHints(intent, { hasSymbolMatch, hasFileMatch }),
    '',
    'Note: @symbolName and @filename.ts tokens in the question are context selectors (resolved in the blocks below).',
    '',
    'User Question:',
    userQuestion,
  ];
  appendRepoContextParts(parts, repoBlock);
  return parts.join('\n');
}

/** Strict user message when auto repo symbol search hit — no Active File / editor metadata. */
function buildSymbolMatchUserMessage(userQuestion: string, repoBlock: string): string {
  const parts = ['Context Mode: symbol-match', '', 'User Question:', userQuestion];
  appendRepoContextParts(parts, repoBlock);
  return parts.join('\n');
}

/**
 * Maps prior chat history + current turn to Ollama messages.
 * system first; up to MAX_OLLAMA_CHAT_TURNS−1 prior user/assistant; current user last (full context).
 * Call before persisting the current user turn to chat history.
 */
export function buildOllamaChatMessages(
  priorHistory: ChatMessage[],
  currentUserMessage: string,
  systemInstruction: string = getChatSystemPrompt(),
): OllamaChatMessage[] {
  const messages: OllamaChatMessage[] = [{ role: 'system', content: systemInstruction }];
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
  messages.push({ role: 'user', content: currentUserMessage });
  const lastUser = messages[messages.length - 1];
  console.log('[Local AI][chat] buildOllamaChatMessages last user length:', lastUser.content.length);
  console.log('[Local AI][chat] last user has [Symbol Match]:', lastUser.content.includes('[Symbol Match]'));
  console.log('[Local AI][chat] last user has [File Match]:', lastUser.content.includes('[File Match]'));
  const intentMatch = /Intent: ([\w-]+)/.exec(lastUser.content);
  if (intentMatch) {
    console.log('[Local AI][chat] Context Mode: explicit-context, Intent:', intentMatch[1]);
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
    const { symbolBlock, fileBlock } = await fetchExplicitContextParts(refs, intent);
    const hasSymbolMatch = symbolBlock.includes('[Symbol Match]');
    const hasFileMatch = fileBlock.includes('[File Match]');
    const shape = { hasSymbolMatch, hasFileMatch };
    const repoBlock = assembleExplicitRepoBlock(symbolBlock, fileBlock, intent);
    console.log('[Local AI][chat] explicit intent:', intent, 'shape:', shape, 'repoBlock length:', repoBlock.length);
    const out = buildExplicitContextUserMessage(userQuestion, repoBlock, intent, hasSymbolMatch, hasFileMatch);
    console.log('[Local AI][chat] final user message (explicit-context):\n', out);
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
    const parts = ['Context Mode: no-editor', '', 'User Question:', userQuestion];
    appendRepoContextParts(parts, repoBlock);
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
    const parts = [
      'Context Mode: selection',
      '',
      'User Question:',
      userQuestion,
    ];
    appendRepoContextParts(parts, repoBlock);
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

  if (wantsFullFileContent(userQuestion)) {
    const parts = [
      'Context Mode: full-file',
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

  const { outline, background } = buildEditorFileContext(fullText, rel, true);
  const parts = [
    'Context Mode: file-outline',
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
    parts.push('', 'Code Context (file excerpt — BACKGROUND, truncated):', '```' + languageId, background, '```');
  }
  appendRepoContextParts(parts, repoBlock);
  const out = parts.join('\n');
  console.log('[Local AI][chat] final user message (file-outline):\n', out);
  return out;
}

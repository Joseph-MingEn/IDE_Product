import type { OllamaChatMessage } from './ollama';

/**
 * When true: send only system + current user (no prior turns). For payload debugging only.
 * Production default: false (multi-turn chat enabled).
 */
export const SKIP_CHAT_HISTORY_FOR_DEBUG = false;

/** When true: clears workspace chat history once on webview provider start. Debug only. */
export const CLEAR_CHAT_HISTORY_ON_DEBUG_ACTIVATE = false;

const USER_PREVIEW_CHARS = 2000;

export type UserMessagePayloadFlags = {
  containsFileMatch: boolean;
  containsSymbolMatch: boolean;
  containsFileOutline: boolean;
  containsKeySections: boolean;
  containsExtensionTs: boolean;
  containsUserQuestion: boolean;
  containsAnswerGuide: boolean;
};

export function analyzeUserMessagePayload(text: string): UserMessagePayloadFlags {
  const lower = text.toLowerCase();
  return {
    containsFileMatch: text.includes('[File Match]'),
    containsSymbolMatch: text.includes('[Symbol Match]'),
    containsFileOutline: text.includes('## File Outline') || text.includes('File Outline'),
    containsKeySections: text.includes('## Key sections') || text.includes('Key sections'),
    containsExtensionTs: lower.includes('extension.ts'),
    containsUserQuestion: text.includes('User Question:'),
    containsAnswerGuide: text.includes('=== Answer guide ==='),
  };
}

export function logUserMessagePayloadPreview(userMessage: string, label = 'current user'): void {
  const flags = analyzeUserMessagePayload(userMessage);
  console.log(`[Local AI][payload] ${label} length=${userMessage.length}`);
  console.log(`[Local AI][payload] ${label} preview (first ${USER_PREVIEW_CHARS} chars):\n`, userMessage.slice(0, USER_PREVIEW_CHARS));
  console.log('[Local AI][payload] content flags:', flags);
}

export function logOllamaPayload(model: string, messages: OllamaChatMessage[]): void {
  console.log('[Local AI][payload] --- Ollama request ---');
  console.log('[Local AI][payload] model:', model);
  console.log('[Local AI][payload] messages.length:', messages.length);
  if (SKIP_CHAT_HISTORY_FOR_DEBUG) {
    console.log('[Local AI][payload] SKIP_CHAT_HISTORY_FOR_DEBUG=true (system + latest user only)');
  }

  console.log('[Local AI][payload] final messages:');
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const flags =
      m.role === 'user' || m.role === 'assistant'
        ? analyzeUserMessagePayload(m.content)
        : null;
    console.log(`[Local AI][payload]   [${i}] role=${m.role} len=${m.content.length}`);
    if (flags) {
      console.log(
        `[Local AI][payload]       containsFileMatch=${flags.containsFileMatch} containsOutline=${flags.containsFileOutline} containsKeySections=${flags.containsKeySections} extension.ts=${flags.containsExtensionTs}`,
      );
    }
  }

  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  if (lastUser) {
    logUserMessagePayloadPreview(lastUser.content, 'last user message in Ollama array');
  } else {
    console.warn('[Local AI][payload] WARNING: no user role in messages array');
  }
  console.log('[Local AI][payload] --- end ---');
}

export function logExplicitContextBuildSummary(summary: {
  refs: { symbols: string[]; files: string[] };
  matchedFilePaths: string[];
  fileBlockLength: number;
  symbolBlockLength: number;
  hasFileMatch: boolean;
  hasSymbolMatch: boolean;
  intent: string;
  finalUserMessageLength: number;
}): void {
  console.log('[Local AI][payload] explicit @file/@symbol build:');
  console.log('[Local AI][payload]   refs:', summary.refs);
  console.log('[Local AI][payload]   matched file paths:', summary.matchedFilePaths);
  console.log('[Local AI][payload]   fileBlock.length:', summary.fileBlockLength);
  console.log('[Local AI][payload]   symbolBlock.length:', summary.symbolBlockLength);
  console.log('[Local AI][payload]   hasFileMatch:', summary.hasFileMatch);
  console.log('[Local AI][payload]   hasSymbolMatch:', summary.hasSymbolMatch);
  console.log('[Local AI][payload]   intent:', summary.intent);
  console.log('[Local AI][payload]   finalUserMessage.length:', summary.finalUserMessageLength);
}

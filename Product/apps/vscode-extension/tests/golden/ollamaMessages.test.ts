import { describe, expect, it } from 'vitest';
import {
  buildOllamaChatMessages,
  buildExplicitContextUserMessage,
  MAX_OLLAMA_CHAT_TURNS,
} from '../../src/prompts/chatPrompt';
import { assembleExplicitRepoBlock } from '../../src/prompts/explicitIntent';
import { formatFileMatchesForIntent } from '../../src/repoContext';
import { analyzeUserMessagePayload, SKIP_CHAT_HISTORY_FOR_DEBUG } from '../../src/debugPayload';
import { buildSampleExtensionFileMatch } from '../helpers/fileMatchFixtures';

describe('buildOllamaChatMessages (v0.9.4 golden)', () => {
  it('production flags: SKIP_CHAT_HISTORY_FOR_DEBUG is false', () => {
    expect(SKIP_CHAT_HISTORY_FOR_DEBUG).toBe(false);
  });

  it('default (no options) includes prior turns', () => {
    const prior = [
      { role: 'user' as const, text: 'u1' },
      { role: 'assistant' as const, text: 'a1' },
    ];
    const messages = buildOllamaChatMessages(prior, 'u2', 'sys');
    expect(messages.length).toBeGreaterThan(2);
    expect(messages[0]).toEqual({ role: 'system', content: 'sys' });
    expect(messages.some((m) => m.role === 'user' && m.content === 'u1')).toBe(true);
    expect(messages.some((m) => m.role === 'assistant' && m.content === 'a1')).toBe(true);
    expect(messages[messages.length - 1]).toEqual({ role: 'user', content: 'u2' });
  });

  it('default caps prior history at MAX_OLLAMA_CHAT_TURNS - 1', () => {
    const prior: Array<{ role: 'user' | 'assistant'; text: string }> = [];
    for (let i = 0; i < 10; i++) {
      prior.push({ role: 'user', text: `u${i}` });
      prior.push({ role: 'assistant', text: `a${i}` });
    }
    const messages = buildOllamaChatMessages(prior, 'current', 'sys');
    const conversational = messages.filter((m) => m.role === 'user' || m.role === 'assistant');
    expect(conversational.length).toBe(MAX_OLLAMA_CHAT_TURNS);
    expect(conversational[conversational.length - 1]).toEqual({ role: 'user', content: 'current' });
    expect(conversational.some((m) => m.content === 'u0')).toBe(false);
    expect(conversational.some((m) => m.content === 'u9')).toBe(true);
  });

  it('skipHistory=true sends only system + current user', () => {
    const prior = [
      { role: 'user' as const, text: 'old question' },
      { role: 'assistant' as const, text: 'old answer' },
      { role: 'user' as const, text: 'another old' },
    ];
    const current = 'Context Mode: file-outline\n\nUser Question:\nhello';
    const messages = buildOllamaChatMessages(prior, current, 'system prompt', { skipHistory: true });

    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ role: 'system', content: 'system prompt' });
    expect(messages[1]).toEqual({ role: 'user', content: current });
  });

  it('current user message includes assembled context', () => {
    const match = buildSampleExtensionFileMatch();
    const fileBlock = formatFileMatchesForIntent([match], 'file-overview');
    const repoBlock = assembleExplicitRepoBlock('', fileBlock, 'file-overview');
    const userMessage = buildExplicitContextUserMessage(
      '@extension.ts summarize architecture',
      repoBlock,
      'file-overview',
      false,
      true,
    );

    const messages = buildOllamaChatMessages([], userMessage, 'sys', { skipHistory: true });
    const lastUser = messages[messages.length - 1];
    expect(lastUser.role).toBe('user');

    const flags = analyzeUserMessagePayload(lastUser.content);
    expect(flags.containsFileMatch).toBe(true);
    expect(flags.containsFileOutline).toBe(true);
    expect(flags.containsUserQuestion).toBe(true);
  });

  it('skipHistory=false includes recent prior turns', () => {
    const prior = [
      { role: 'user' as const, text: 'u1' },
      { role: 'assistant' as const, text: 'a1' },
    ];
    const messages = buildOllamaChatMessages(prior, 'u2', 'sys', { skipHistory: false });
    expect(messages.length).toBeGreaterThan(2);
    expect(messages.some((m) => m.role === 'user' && m.content === 'u1')).toBe(true);
  });
});

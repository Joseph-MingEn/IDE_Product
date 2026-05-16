import { describe, expect, it } from 'vitest';
import { buildOllamaChatMessages, buildExplicitContextUserMessage } from '../../src/prompts/chatPrompt';
import { assembleExplicitRepoBlock } from '../../src/prompts/explicitIntent';
import { formatFileMatchesForIntent } from '../../src/repoContext';
import { analyzeUserMessagePayload } from '../../src/debugPayload';
import { buildSampleExtensionFileMatch } from '../helpers/fileMatchFixtures';

describe('buildOllamaChatMessages (v0.9.4 golden)', () => {
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

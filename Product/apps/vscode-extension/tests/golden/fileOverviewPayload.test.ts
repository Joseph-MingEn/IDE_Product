import { describe, expect, it } from 'vitest';
import { assembleExplicitRepoBlock } from '../../src/prompts/explicitIntent';
import { buildExplicitContextUserMessage } from '../../src/prompts/chatPrompt';
import { formatFileMatchesForIntent } from '../../src/repoContext';
import { analyzeUserMessagePayload } from '../../src/debugPayload';
import { buildSampleExtensionFileMatch, longRawExcerpt } from '../helpers/fileMatchFixtures';

describe('file-overview payload (v0.9.4 golden)', () => {
  it('[File Match] includes File Outline and Key Sections; omits long raw excerpt', () => {
    const match = buildSampleExtensionFileMatch();
    expect(match.outlineMarkdown).toContain('## File Outline');
    expect(match.keySections).toContain('## Key sections');

    const fileBlock = formatFileMatchesForIntent([match], 'file-overview');
    expect(fileBlock).toContain('[File Match]');
    expect(fileBlock).toContain('## File Outline');
    expect(fileBlock).toContain('## Key sections');
    expect(fileBlock).not.toMatch(/Raw file excerpt/i);
    expect(fileBlock).not.toContain('### Background excerpt only');
  });

  it('when outline + key sections exist, optional excerpt is omitted even if background is huge', () => {
    const match = buildSampleExtensionFileMatch();
    match.backgroundSnippet = longRawExcerpt(8_000);
    const fileBlock = formatFileMatchesForIntent([match], 'file-overview');
    expect(fileBlock).toContain('## File Outline');
    expect(fileBlock).toContain('## Key sections');
    expect(fileBlock).not.toContain('### Background excerpt only');
    expect(fileBlock).not.toMatch(/Raw file excerpt/i);
    expect(fileBlock.length).toBeLessThan(12_000);
  });

  it('explicit file-overview user message carries intent, contract, and structured file block', () => {
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

    expect(userMessage).toContain('Intent: file-overview');
    expect(userMessage).toContain('Context Mode: explicit-context');

    const flags = analyzeUserMessagePayload(userMessage);
    expect(flags.containsFileMatch).toBe(true);
    expect(flags.containsFileOutline).toBe(true);
    expect(flags.containsKeySections).toBe(true);
    expect(flags.containsAnswerGuide).toBe(true);
    expect(userMessage).not.toMatch(/Raw file excerpt/i);
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildExplicitContextContract,
  buildFileOverviewAnswerGuideReminder,
  buildPromptContract,
} from '../../src/prompts/promptContracts';

const FILE_OVERVIEW_HEADINGS = [
  '## Module purpose',
  '## Main parts',
  '## Runtime flow',
  '## How the pieces work together',
] as const;

describe('prompt contract (v0.9.4 golden)', () => {
  it('file-overview contract lists four required headings', () => {
    const contract = buildPromptContract('file-overview');
    for (const heading of FILE_OVERVIEW_HEADINGS) {
      expect(contract).toContain(heading);
    }
    expect(contract).toContain('=== Answer guide ===');
    expect(contract).toContain('Do not include code blocks');
  });

  it('explicit file-overview contract matches file-overview guide', () => {
    const explicit = buildExplicitContextContract('file-overview', {
      hasSymbolMatch: false,
      hasFileMatch: true,
    });
    for (const heading of FILE_OVERVIEW_HEADINGS) {
      expect(explicit).toContain(heading);
    }
  });

  it('file-overview reminder repeats the four headings', () => {
    const reminder = buildFileOverviewAnswerGuideReminder();
    for (const heading of FILE_OVERVIEW_HEADINGS) {
      expect(reminder).toContain(heading);
    }
  });
});

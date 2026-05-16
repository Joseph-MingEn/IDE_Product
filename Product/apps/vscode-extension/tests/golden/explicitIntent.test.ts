import { describe, expect, it } from 'vitest';
import { detectExplicitIntent } from '../../src/prompts/explicitIntent';
import { extractExplicitContextRefs } from '../../src/prompts/repoPrompt';

describe('explicit intent (v0.9.4 golden)', () => {
  it('@extension.ts summarize architecture → file-overview', () => {
    const q = '@extension.ts summarize architecture';
    const refs = extractExplicitContextRefs(q);
    expect(refs.files).toContain('extension.ts');
    const intent = detectExplicitIntent(q, {
      hasSymbolMatch: refs.symbols.length > 0,
      hasFileMatch: refs.files.length > 0,
    });
    expect(intent).toBe('file-overview');
  });

  it('@extension.ts @ChatViewProvider explain lifecycle → symbol-lifecycle', () => {
    const q = '@extension.ts @ChatViewProvider explain lifecycle';
    const refs = extractExplicitContextRefs(q);
    expect(refs.symbols).toContain('ChatViewProvider');
    expect(refs.files).toContain('extension.ts');
    const intent = detectExplicitIntent(q, {
      hasSymbolMatch: true,
      hasFileMatch: true,
    });
    expect(intent).toBe('symbol-lifecycle');
  });

  it('@ChatViewProvider 在哪裡 → definition-lookup', () => {
    const q = '@ChatViewProvider 在哪裡';
    const refs = extractExplicitContextRefs(q);
    expect(refs.symbols).toContain('ChatViewProvider');
    const intent = detectExplicitIntent(q, {
      hasSymbolMatch: true,
      hasFileMatch: refs.files.length > 0,
    });
    expect(['definition-lookup', 'symbol-explanation']).toContain(intent);
    expect(intent).toBe('definition-lookup');
  });
});

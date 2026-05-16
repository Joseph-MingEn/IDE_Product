import { describe, expect, it } from 'vitest';
import { wantsFullFileContent } from '../../src/fileOutline';
import { resolveEditorContextMode } from '../../src/prompts/editorContextMode';
import { buildFileOutlineUserMessage } from '../../src/prompts/chatPrompt';
import { buildEditorFileContext } from '../../src/repoContext';
import { loadSampleExtensionSource } from '../helpers/fileMatchFixtures';

describe('file-outline mode (v0.9.4 golden)', () => {
  const question = '這檔在做什麼';

  it('general overview question uses file-outline, not full-file', () => {
    expect(wantsFullFileContent(question)).toBe(false);
    expect(resolveEditorContextMode(question, { hasEditor: true, hasSelection: false })).toBe(
      'file-outline',
    );
  });

  it('buildEditorFileContext excludes background when includeBackground=false', () => {
    const rel = 'apps/vscode-extension/src/extension.ts';
    const text = loadSampleExtensionSource();
    const { outline, background } = buildEditorFileContext(text, rel, false);
    expect(outline).toContain('## File Outline');
    expect(background).toBe('');
  });

  it('file-outline user message has outline primary and no full-file dump', () => {
    const rel = 'apps/vscode-extension/src/extension.ts';
    const text = loadSampleExtensionSource();
    const { outline, background } = buildEditorFileContext(text, rel, false);
    const msg = buildFileOutlineUserMessage(question, rel, 'typescript', outline, background, '');

    expect(msg).toContain('Context Mode: file-outline');
    expect(msg).toContain('Code Context (file outline — PRIMARY):');
    expect(msg).toContain('## File Outline');
    expect(msg).not.toContain('Context Mode: full-file');
    expect(msg).not.toContain('Code Context (full file');
    expect(msg).not.toMatch(/Raw file excerpt/i);
    expect(msg).not.toContain('### Background excerpt only');
    expect(background).toBe('');
  });
});

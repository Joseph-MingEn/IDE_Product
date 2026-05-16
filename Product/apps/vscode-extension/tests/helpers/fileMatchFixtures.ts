import * as vscode from 'vscode';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createFileMatchFromText } from '../../src/repoContext';

const FIXTURE_DIR = join(__dirname, '..', 'fixtures');

export function loadSampleExtensionSource(): string {
  return readFileSync(join(FIXTURE_DIR, 'sample-extension.ts'), 'utf8');
}

export function buildSampleExtensionFileMatch() {
  const rel = 'apps/vscode-extension/src/extension.ts';
  const text = loadSampleExtensionSource();
  return createFileMatchFromText(vscode.Uri.file(rel), rel, 'extension.ts', text);
}

/** Long filler to simulate a big raw excerpt (should not appear in overview-primary). */
export function longRawExcerpt(chars = 5_000): string {
  return 'x'.repeat(chars);
}

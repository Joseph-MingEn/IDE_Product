import { wantsFullFileContent } from '../fileOutline';

/** Active-editor context branch (no VS Code API). */
export type EditorContextMode = 'no-editor' | 'selection' | 'full-file' | 'file-outline';

export function resolveEditorContextMode(
  question: string,
  opts: { hasEditor: boolean; hasSelection: boolean },
): EditorContextMode {
  if (!opts.hasEditor) {
    return 'no-editor';
  }
  if (opts.hasSelection) {
    return 'selection';
  }
  if (wantsFullFileContent(question)) {
    return 'full-file';
  }
  return 'file-outline';
}

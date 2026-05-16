/** Minimal vscode stub for unit tests (no Extension Host). */

export class Uri {
  readonly fsPath: string;
  private constructor(fsPath: string) {
    this.fsPath = fsPath;
  }
  static file(fsPath: string): Uri {
    return new Uri(fsPath);
  }
  toString(): string {
    return this.fsPath;
  }
}

export const workspace = {
  workspaceFolders: undefined as undefined | Array<{ uri: Uri }>,
  asRelativePath(uri: Uri, _includeWorkspaceFolder?: boolean): string {
    return uri.fsPath.replace(/\\/g, '/');
  },
  findFiles: async (): Promise<Uri[]> => [],
};

export const window = {
  activeTextEditor: undefined as undefined | {
    document: { uri: Uri; languageId: string; getText: () => string };
    selection: unknown;
  },
};

export class Range {
  constructor(
    readonly start: unknown,
    readonly end: unknown,
  ) {}
}

export class WorkspaceEdit {
  replace(_uri: Uri, _range: Range, _text: string): void {}
}

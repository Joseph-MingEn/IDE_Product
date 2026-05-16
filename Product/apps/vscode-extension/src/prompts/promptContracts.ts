import type { ExplicitContextShape, ExplicitIntent } from './explicitIntent';

/** All modes that have an answer guide. */
export type PromptContractMode =
  | ExplicitIntent
  | 'symbol-match'
  | 'file-outline'
  | 'selection'
  | 'full-file';

/** Placed before User Question; repo blocks follow the question. */
export function buildContextSufficiencyPreamble(): string {
  return [
    'You are given enough repository context below.',
    'Treat File Outline, Key Sections, Symbol Match, and File Match as the available source of truth.',
    'Do not ask for more code or the full source file.',
    'Do not say the code is incomplete—use the provided outline and excerpts.',
    'If a detail is missing, write "not shown in provided context" and continue.',
  ].join('\n');
}

function formatAnswerGuide(body: string): string {
  return ['=== Answer guide ===', body].join('\n');
}

function guideFileOverview(): string {
  return formatAnswerGuide(
    [
      'Please write the answer using exactly these Markdown headings:',
      '## Module purpose',
      '## Main parts',
      '## Runtime flow',
      '## How the pieces work together',
      '',
      'Do not include code blocks.',
      'Do not say the snippet is incomplete.',
      'Base the answer mainly on File Outline and Key Sections.',
    ].join('\n'),
  );
}

/** Repeated after repo context so long [File Match] does not dilute the template. */
export function buildFileOverviewAnswerGuideReminder(): string {
  return [
    '=== Answer guide (reminder) ===',
    'Use exactly: ## Module purpose, ## Main parts, ## Runtime flow, ## How the pieces work together',
    'Do not include code blocks.',
    'Do not say the snippet is incomplete.',
    'Base the answer mainly on File Outline and Key Sections.',
  ].join('\n');
}

function guideSymbolLifecycle(): string {
  return formatAnswerGuide(
    [
      'Please answer with these sections:',
      '## Symbol role',
      '## Where it is created or registered',
      '## Main lifecycle',
      '## Related message flow',
    ].join('\n'),
  );
}

function guideDefinitionLookup(): string {
  return formatAnswerGuide(
    [
      'Keep it short.',
      'Start with: File, Line, and Symbol from [Symbol Match].',
      'Then one short paragraph on what it does.',
    ].join('\n'),
  );
}

function guideSymbolExplanation(): string {
  return formatAnswerGuide(
    [
      'Explain what the symbol does using [Symbol Match].',
      'Optional short sections: ## Purpose, ## How it works',
    ].join('\n'),
  );
}

function guideSymbolMatch(): string {
  return formatAnswerGuide(
    [
      'Answer from [Symbol Match] only.',
      'If the question is "where", start with file path, line, and symbol name.',
    ].join('\n'),
  );
}

function guideFileOutline(): string {
  return formatAnswerGuide(
    [
      'Start with a short summary of what this file does.',
      'Then explain the main sections from File Outline and Key Sections.',
      'Do not include code blocks unless the user explicitly asks for code.',
      'Do not say the snippet is incomplete.',
    ].join('\n'),
  );
}

function guideSelection(): string {
  return formatAnswerGuide('Answer about the selected snippet only.');
}

function guideFullFile(): string {
  return formatAnswerGuide('Answer the question using the full file content provided.');
}

/** Build the answer guide for a given mode. */
export function buildPromptContract(mode: PromptContractMode, _shape?: ExplicitContextShape): string {
  switch (mode) {
    case 'file-overview':
      return guideFileOverview();
    case 'symbol-lifecycle':
      return guideSymbolLifecycle();
    case 'definition-lookup':
      return guideDefinitionLookup();
    case 'symbol-explanation':
      return guideSymbolExplanation();
    case 'symbol-match':
      return guideSymbolMatch();
    case 'file-outline':
      return guideFileOutline();
    case 'selection':
      return guideSelection();
    case 'full-file':
      return guideFullFile();
    default:
      return guideSymbolExplanation();
  }
}

/** Explicit-context: light routing + answer guide. */
export function buildExplicitContextContract(intent: ExplicitIntent, _shape: ExplicitContextShape): string {
  return buildPromptContract(intent);
}

/** Routing intent for explicit @symbol / @file context. */
export type ExplicitIntent =
  | 'symbol-explanation'
  | 'file-overview'
  | 'symbol-lifecycle'
  | 'definition-lookup';

export type ExplicitContextShape = {
  hasSymbolMatch: boolean;
  hasFileMatch: boolean;
};

function questionLower(question: string): string {
  return question.toLowerCase();
}

function matchesWhereIntent(q: string): boolean {
  return /(?:\bwhere\b|在哪|哪裡|哪里|定義|定义|definition|位置)/i.test(q);
}

function matchesFileOverviewIntent(q: string): boolean {
  return (
    /\bsummarize\b/i.test(q) ||
    /\bsummary\b/i.test(q) ||
    /\barchitecture\b/i.test(q) ||
    /\boverview\b/i.test(q) ||
    /整體|整体|架構|架构|概覽|概述|總覽|总览/i.test(q) ||
    /explain this file/i.test(q) ||
    /解釋這個檔|解释这个档|檔案概覽|文件概览|說明這個檔|说明这个档/i.test(q) ||
    /\bfile overview\b/i.test(q)
  );
}

function matchesLifecycleIntent(q: string): boolean {
  return (
    /\blifecycle\b/i.test(q) ||
    /\blife[- ]?cycle\b/i.test(q) ||
    /\bflow\b/i.test(q) ||
    /\binteraction\b/i.test(q) ||
    /\bcall path\b/i.test(q) ||
    /生命週期|生命周期|流程|互動|交互|調用鏈|调用链/i.test(q)
  );
}

function matchesExplainIntent(q: string): boolean {
  return (
    /\bexplain\b/i.test(q) ||
    /解釋|解释|說明|说明/i.test(q) ||
    /\bwhat does\b/i.test(q) ||
    /是做什麼|做什么|是什麼|是什么/i.test(q)
  );
}

/**
 * Infer explicit-context intent from user wording and which context blocks exist.
 */
export function detectExplicitIntent(
  question: string,
  shape: ExplicitContextShape,
): ExplicitIntent {
  const q = questionLower(question);
  const { hasSymbolMatch, hasFileMatch } = shape;

  if (matchesWhereIntent(q) && hasSymbolMatch) {
    return 'definition-lookup';
  }

  if (matchesFileOverviewIntent(q) && hasFileMatch) {
    return 'file-overview';
  }

  if (matchesLifecycleIntent(q) && hasSymbolMatch) {
    return 'symbol-lifecycle';
  }

  if (hasSymbolMatch && hasFileMatch) {
    if (matchesLifecycleIntent(q) || (matchesExplainIntent(q) && !matchesFileOverviewIntent(q))) {
      return 'symbol-lifecycle';
    }
    return 'symbol-explanation';
  }

  if (hasFileMatch && !hasSymbolMatch) {
    return 'file-overview';
  }

  if (hasSymbolMatch && !hasFileMatch) {
    if (matchesWhereIntent(q)) {
      return 'definition-lookup';
    }
    if (matchesLifecycleIntent(q)) {
      return 'symbol-lifecycle';
    }
    return 'symbol-explanation';
  }

  return 'symbol-explanation';
}

/** Per-intent instructions placed in the user message (routing hints). */
export function buildExplicitIntentHints(intent: ExplicitIntent, shape: ExplicitContextShape): string {
  const lines: string[] = ['Explicit intent routing:'];

  switch (intent) {
    case 'definition-lookup':
      lines.push(
        '- Primary goal: answer WHERE the symbol is defined.',
        '- Use [Symbol Match] only: first sentence = File + Line + Symbol.',
        '- Do not summarize unrelated classes or the whole extension.',
      );
      break;
    case 'file-overview':
      lines.push(
        '- Primary goal: FILE-LEVEL architecture overview (entire file in [File Match]).',
        '- Cover: module purpose, major components, registration/activation, message flow, and how pieces connect.',
        '- Do NOT make a single class (e.g. ChatViewProvider) the whole answer unless the user @mentioned that symbol as the focus.',
        '- Do NOT default to “this extension does X” generic marketing text—use concrete structure from [File Match].',
      );
      if (shape.hasSymbolMatch) {
        lines.push(
          '- [File Match] is PRIMARY; [Symbol Match] is optional background—do not let one symbol dominate the overview.',
        );
      } else {
        lines.push('- Only [File Match] is provided: analyze the full file, not one type/class in isolation.');
      }
      break;
    case 'symbol-lifecycle':
      lines.push(
        '- Primary goal: explain the @symbol lifecycle, flow, interactions, and call relationships.',
        '- [Symbol Match] is the MAIN analysis target (definition, methods, resolve/register, message handlers).',
        '- [File Match] is BACKGROUND only—use it to explain how the symbol fits the file architecture.',
        '- Describe: creation, key methods, what triggers it, what it calls, and how it relates to neighboring code.',
        '- Do not give a generic extension-wide essay; stay anchored to the @symbol and its file.',
      );
      break;
    case 'symbol-explanation':
      lines.push(
        '- Primary goal: explain what the @symbol does and how it works.',
        '- [Symbol Match] is the primary source.',
        shape.hasFileMatch
          ? '- [File Match] is supplementary background—not the main subject.'
          : '- Answer from [Symbol Match] definition and surrounding snippet.',
      );
      break;
    default:
      break;
  }

  if (shape.hasFileMatch && !shape.hasSymbolMatch) {
    lines.push('- Context shape: file-only → entire file architecture is the subject.');
  } else if (shape.hasSymbolMatch && shape.hasFileMatch) {
    lines.push('- Context shape: symbol + file → follow Intent above for primary vs background.');
  } else if (shape.hasSymbolMatch) {
    lines.push('- Context shape: symbol-only → use [Symbol Match] only.');
  }

  return lines.join('\n');
}

/** file-overview puts [File Match] before [Symbol Match]; others keep symbol first. */
export function shouldPutFileMatchFirst(intent: ExplicitIntent): boolean {
  return intent === 'file-overview';
}

function labelBlock(role: 'primary' | 'background', block: string): string {
  if (block.length === 0) {
    return '';
  }
  const tag = role === 'primary' ? 'PRIMARY' : 'BACKGROUND (supporting only)';
  return `[Context priority: ${tag}]\n${block}`;
}

export function assembleExplicitRepoBlock(
  symbolBlock: string,
  fileBlock: string,
  intent: ExplicitIntent,
): string {
  const fileFirst = shouldPutFileMatchFirst(intent);
  const sections = fileFirst
    ? [labelBlock('primary', fileBlock), labelBlock('background', symbolBlock)]
    : [labelBlock('primary', symbolBlock), labelBlock('background', fileBlock)];
  return sections.filter((s) => s.length > 0).join('\n\n');
}

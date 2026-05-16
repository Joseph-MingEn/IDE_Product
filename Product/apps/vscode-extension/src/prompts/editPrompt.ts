import * as vscode from 'vscode';

/** System prompt for /edit: full modified file only; extension opens diff preview. */
export function getEditSystemPrompt(): string {
  return [
    '你是 VSCode 中的程式修改助手（檔案預覽模式；本階段不會寫入或套用任何變更）。',
    '此為 /edit 指令：無論使用者要求解釋、markdown、摘要或註解說明，你都必須遵守下列輸出協定，不得改為聊天或教學模式。',
    '- 只輸出「完整修改後的檔案內容」純文字：與原檔相同語言／格式，包含所有未修改與已修改的行。',
    '- 不可使用 markdown（無 # 標題包裝、無列表說明、無 ``` fence）。',
    '- 不可解釋、不可前言、不可結語、不可摘要。',
    '- 禁止以「以下是」「說明」「Explanation」「Here is」或類似語句開頭。',
    '- 不要輸出 unified diff、patch、diff --git。',
    '- 不要省略未修改的內容；不可只回傳片段。',
    '- 若無法依指示安全修改，請輸出與訊息中「目前完整檔案」相同的原始完整內容（一字不漏）。',
  ].join('\n');
}

/** /edit user message: instruction + file/selection context; model must return full file. */
export function buildEditUserMessage(instruction: string, editor: vscode.TextEditor): string {
  const doc = editor.document;
  const filePath = doc.uri.fsPath;
  const languageId = doc.languageId;
  const fullFileContent = doc.getText();
  const selectedRaw = doc.getText(editor.selection);
  const hasSelection = selectedRaw.trim().length > 0;
  const sel = editor.selection;
  const startLine0 = Math.min(sel.start.line, sel.end.line);
  const endLine0 = Math.max(sel.start.line, sel.end.line);
  const selectionStart = startLine0 + 1;
  const selectionEnd = endLine0 + 1;

  const contextMode = hasSelection ? 'selection' : 'full-file';

  const parts: string[] = [
    'Command: /edit (full-file preview — 不會寫入磁碟)',
    '',
    'Edit Instruction:',
    instruction.length > 0 ? instruction : '(未提供額外說明，請依程式意圖提出最小合理修改)',
    '',
    `Context Mode: ${contextMode}`,
    '',
    'Active File:',
    filePath,
    '',
    'Language:',
    languageId,
    '',
    '重要：你的輸出必須是「完整修改後的檔案內容」純文字（與下方整檔同一結構），不是 unified diff、不是 patch、不是摘要。',
    '即使 Edit Instruction 要求 markdown 解釋、註解說明或教學，仍只輸出整檔程式內容，不可輸出解釋型文字。',
    '無論是否有 selection，都必須輸出整份檔案；未改動的段落需原樣保留。',
    'Selection（若有）僅標示修改焦點，輸出仍須為整檔。',
    '',
  ];

  if (hasSelection) {
    parts.push(
      'Edit focus (selection — 請優先在此範圍內改動，但回覆仍須包含整份檔案):',
      '',
      `selectionStart (line, 1-based): ${selectionStart}`,
      `selectionEnd (line, 1-based): ${selectionEnd}`,
      '',
      'Selected text:',
      selectedRaw,
      '',
    );
  }

  parts.push(
    'Current full file (請據此產出修改後的完整檔案內容):',
    fullFileContent,
    '',
    '請只輸出完整修改後的檔案內容（純文字）。',
  );

  return parts.join('\n');
}

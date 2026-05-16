import * as vscode from 'vscode';
import { getDefaultToolRegistry } from './registry';
import type { Tool, ToolExecutionResult } from './types';

export const TOOL_DEBUG_OUTPUT_CHANNEL = 'Local AI Tools';

const DEFAULT_ARGS_BY_TOOL: Record<string, string> = {
  find_symbol: JSON.stringify({ symbol: 'ChatViewProvider' }, null, 2),
  resolve_file: JSON.stringify({ fileName: 'extension.ts' }, null, 2),
  read_file_outline: JSON.stringify({ fileName: 'extension.ts' }, null, 2),
  read_selection: '{}',
  read_active_file: JSON.stringify({ mode: 'outline' }, null, 2),
};

/** Parse JSON tool args from the debug input box (empty → {}). */
export function parseToolArgsJson(raw: string): Record<string, unknown> | { error: string } {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { error: 'Args must be a JSON object, e.g. {"symbol":"Foo"}' };
    }
    return parsed as Record<string, unknown>;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { error: `Invalid JSON: ${message}` };
  }
}

function formatToolResult(name: string, args: Record<string, unknown>, result: ToolExecutionResult): string {
  const header = [
    `[Local AI][tools] ${name}`,
    `args: ${JSON.stringify(args)}`,
    `ok: ${result.ok}`,
  ];
  if (result.ok) {
    header.push(`text: ${result.text}`);
    header.push('data:', JSON.stringify(result.data, null, 2));
  } else {
    header.push(`error: ${result.error}`);
  }
  return header.join('\n');
}

function getOutputChannel(): vscode.OutputChannel {
  return vscode.window.createOutputChannel(TOOL_DEBUG_OUTPUT_CHANNEL);
}

async function pickTool(tools: Tool[]): Promise<Tool | undefined> {
  if (tools.length === 0) {
    void vscode.window.showWarningMessage('Local AI: no tools registered.');
    return undefined;
  }
  const picked = await vscode.window.showQuickPick(
    tools.map((t) => ({
      label: t.name,
      description: t.description,
      tool: t,
    })),
    {
      placeHolder: 'Select a tool to run (developer debug)',
      title: 'Local AI — Run Tool',
    },
  );
  return picked?.tool;
}

async function promptToolArgs(toolName: string): Promise<Record<string, unknown> | undefined> {
  const value = DEFAULT_ARGS_BY_TOOL[toolName] ?? '{}';
  const raw = await vscode.window.showInputBox({
    title: `Local AI — ${toolName} args (JSON)`,
    prompt: 'Tool arguments as JSON object. Leave empty for {}.',
    value,
    validateInput(text) {
      const parsed = parseToolArgsJson(text);
      if ('error' in parsed) {
        return parsed.error;
      }
      return undefined;
    },
  });
  if (raw === undefined) {
    return undefined;
  }
  const parsed = parseToolArgsJson(raw);
  if ('error' in parsed) {
    return undefined;
  }
  return parsed;
}

export async function runToolDebugCommand(): Promise<void> {
  const registry = getDefaultToolRegistry();
  const tool = await pickTool(registry.list());
  if (!tool) {
    return;
  }

  const args = await promptToolArgs(tool.name);
  if (args === undefined) {
    return;
  }

  const output = getOutputChannel();
  output.clear();
  output.show(true);
  output.appendLine(`Running tool: ${tool.name}`);
  output.appendLine(`Args: ${JSON.stringify(args)}`);
  output.appendLine('---');

  const started = Date.now();
  const result = await registry.execute(tool.name, args);
  const elapsed = Date.now() - started;
  const formatted = formatToolResult(tool.name, args, result);

  output.appendLine(formatted);
  output.appendLine('---');
  output.appendLine(`Done in ${elapsed}ms`);

  console.log(formatted);

  if (result.ok) {
    void vscode.window.showInformationMessage(`Local AI tool "${tool.name}" OK (${elapsed}ms). See Output: ${TOOL_DEBUG_OUTPUT_CHANNEL}.`);
  } else {
    void vscode.window.showErrorMessage(`Local AI tool "${tool.name}" failed: ${result.error}`);
  }
}

export function registerRunToolCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('localAi.runTool', () => {
      void runToolDebugCommand();
    }),
  );
}

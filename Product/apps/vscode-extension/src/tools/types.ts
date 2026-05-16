/** JSON-schema-style tool parameters (for docs / future LLM tool lists). */
export type ToolParameterProperty = {
  type: 'string' | 'boolean' | 'number' | 'array';
  description: string;
  items?: { type: 'string' };
};

export type ToolParameters = {
  type: 'object';
  properties: Record<string, ToolParameterProperty>;
  required?: string[];
};

/** Host context passed into every tool execution (no agent state). */
export type ToolContext = Record<string, never>;

export type ToolResult<T = unknown> = {
  ok: true;
  data: T;
  /** Human-readable summary for logs / debug. */
  text: string;
};

export type ToolFailure = {
  ok: false;
  error: string;
};

export type ToolExecutionResult<T = unknown> = ToolResult<T> | ToolFailure;

export interface Tool<TArgs = Record<string, unknown>, TData = unknown> {
  name: string;
  description: string;
  parameters: ToolParameters;
  execute(args: TArgs, ctx: ToolContext): Promise<ToolExecutionResult<TData>>;
}

export function toolSuccess<T>(data: T, text: string): ToolResult<T> {
  return { ok: true, data, text };
}

export function toolFailure(error: string): ToolFailure {
  return { ok: false, error };
}

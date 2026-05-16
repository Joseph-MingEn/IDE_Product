import { editorTools } from './editorTools';
import { repoTools } from './repoTools';
import type { Tool, ToolContext, ToolExecutionResult } from './types';
import { toolFailure } from './types';

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): this {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
    return this;
  }

  registerAll(tools: Tool[]): this {
    for (const tool of tools) {
      this.register(tool);
    }
    return this;
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return [...this.tools.values()];
  }

  listNames(): string[] {
    return [...this.tools.keys()].sort();
  }

  /**
   * Run a tool by name. Unknown tools and thrown errors become structured failures
   * (never thrown to callers).
   */
  async execute(
    name: string,
    args: Record<string, unknown> = {},
    ctx: ToolContext = {},
  ): Promise<ToolExecutionResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return toolFailure(`Unknown tool: ${name}`);
    }
    try {
      return await tool.execute(args, ctx);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn(`[Local AI][tools] ${name} failed:`, message);
      return toolFailure(message);
    }
  }
}

/** Phase 1 default registry (repo + editor tools). Not wired to chat. */
export function createDefaultToolRegistry(): ToolRegistry {
  return new ToolRegistry().registerAll([...repoTools, ...editorTools]);
}

let defaultRegistry: ToolRegistry | undefined;

/** Lazy singleton for host/debug callers (optional). */
export function getDefaultToolRegistry(): ToolRegistry {
  if (!defaultRegistry) {
    defaultRegistry = createDefaultToolRegistry();
  }
  return defaultRegistry;
}

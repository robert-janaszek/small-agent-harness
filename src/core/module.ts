import type { DiffTerminal } from '../cli/tui/diffTerminal';
import type { EmitFn } from './protocol';
import type { Tool } from './tool';

export const HARNESS_PROMPT = `You are an agent running inside a tool-calling harness.

How this harness works:
- Each user message starts a turn. You may call tools, then you will see their results and can call more tools, until you reply with text.
- Tools come from optional modules. If none are available, answer from the conversation alone. Never invent a tool name.
- This is a conversation with a human. Listen to what they actually said. Ask only when something is still missing.
- If the user tells you to choose, invent, skip, or fill in a value, do that. Do not refuse and re-ask for the same field.
- Follow any module instructions below. They describe the task and how to use that module's tools.
- When the task for this turn is done, reply in prose. Do not keep calling tools after you have finished.`;

export type ModuleRuntime = {
  emit(event: string, payload?: unknown): void;
};

export type PanelPaintContext = {
  terminal: DiffTerminal;
  startCol: number;
  width: number;
  height: number;
};

export type ModulePanel = {
  paint(ctx: PanelPaintContext): void;
  onEvent?(event: string, payload?: unknown): void;
};

export type Module = {
  id: string;
  prompt?: string;
  tools?: Tool<any>[];
  createPanel?: () => ModulePanel;
  onSessionStart?: (runtime: ModuleRuntime) => void;
  onSessionReset?: (runtime: ModuleRuntime) => void;
  onToolRound?: (runtime: ModuleRuntime) => void;
};

export function createModuleRuntime(moduleId: string, emit: EmitFn): ModuleRuntime {
  return {
    emit(event, payload) {
      emit({
        type: 'module',
        module: moduleId,
        event,
        ...(payload !== undefined ? { payload } : {}),
      });
    },
  };
}

export function composeSystemPrompt(basePrompt: string, modules: Module[]): string {
  const parts = [basePrompt.trim()];
  for (const module of modules) {
    const prompt = module.prompt?.trim();
    if (!prompt) {
      continue;
    }
    parts.push(`# Module: ${module.id}\n${prompt}`);
  }
  return parts.join('\n\n');
}

export function collectTools(modules: Module[]): Tool<any>[] {
  const tools: Tool<any>[] = [];
  const seen = new Map<string, string>();

  for (const module of modules) {
    for (const tool of module.tools ?? []) {
      const name = tool.function.name;
      const owner = seen.get(name);
      if (owner) {
        throw new Error(`Duplicate tool "${name}" registered by modules "${owner}" and "${module.id}"`);
      }
      seen.set(name, module.id);
      tools.push(tool);
    }
  }

  return tools;
}

export function assertUniqueModuleIds(modules: Module[]): void {
  const seen = new Set<string>();
  for (const module of modules) {
    if (seen.has(module.id)) {
      throw new Error(`Duplicate module id "${module.id}"`);
    }
    seen.add(module.id);
  }
}

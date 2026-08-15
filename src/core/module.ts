import type { EmitFn } from './protocol';
import type { Tool } from './tool';

export const DEFAULT_PROMPT = "You are a helpful assistant. Answer the user's questions.";

export type ModuleRuntime = {
  emit(event: string, payload?: unknown): void;
};

export type Module = {
  id: string;
  prompt?: string;
  tools?: Tool[];
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
  const parts = [basePrompt, ...modules.map((module) => module.prompt).filter((prompt): prompt is string => Boolean(prompt))];
  return parts.join('\n\n');
}

export function collectTools(modules: Module[]): Tool[] {
  const tools: Tool[] = [];
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

import type { Tool, ToolActivity, ToolActivityVerb } from '../tool';

export type ToolActivityStatus = 'running' | 'done';

function resolveVerb(verb: ToolActivityVerb, args: unknown): string {
  return typeof verb === 'function' ? verb(args) : verb;
}

export function indexToolActivity(
  tools: ReadonlyArray<Pick<Tool, 'function' | 'activity'>>,
): Map<string, ToolActivity> {
  return new Map(tools.map((tool) => [tool.function.name, tool.activity]));
}

export function formatToolActivity(
  name: string,
  args: unknown,
  status: ToolActivityStatus,
  activity?: ToolActivity,
): string {
  const fallback = status === 'running' ? `calling ${name}` : `called ${name}`;
  if (!activity) {
    return fallback;
  }

  try {
    const verb = resolveVerb(status === 'running' ? activity.present : activity.past, args);
    const target = activity.target?.(args);
    return target ? `${verb} ${target}` : verb;
  } catch {
    return fallback;
  }
}

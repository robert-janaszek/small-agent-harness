import type { Tool, ToolActivity, ToolActivityVerb } from '../tool';

export type ToolActivityStatus = 'running' | 'done' | 'failed';

function resolveVerb(verb: ToolActivityVerb, args: unknown): string {
  return typeof verb === 'function' ? verb(args) : verb;
}

function fallbackLabel(name: string, status: ToolActivityStatus): string {
  if (status === 'running') {
    return `calling ${name}`;
  }
  if (status === 'failed') {
    return `failed ${name}`;
  }
  return `called ${name}`;
}

function resolveActivityVerb(
  name: string,
  args: unknown,
  status: ToolActivityStatus,
  activity: ToolActivity,
): string {
  if (status === 'running') {
    return resolveVerb(activity.present, args);
  }
  if (status === 'failed') {
    return activity.failed ? resolveVerb(activity.failed, args) : `failed to ${name}`;
  }
  return resolveVerb(activity.past, args);
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
  const fallback = fallbackLabel(name, status);
  if (!activity) {
    return fallback;
  }

  try {
    const verb = resolveActivityVerb(name, args, status, activity);
    const target = activity.target?.(args);
    return target ? `${verb} ${target}` : verb;
  } catch {
    return fallback;
  }
}

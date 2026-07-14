import { z } from 'zod';

export function formatZodError(error: z.ZodError, title: string): string {
  return `${title}:\n- ${error.issues.map((issue) => issue.message).join('\n- ')}`;
}

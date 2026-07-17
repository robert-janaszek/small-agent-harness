import { z } from 'zod';

export const READ_MAX_LIMIT = 80;

export const readArgsSchema = z.object({
  offset: z
    .number()
    .int()
    .min(1)
    .describe('1-based line number to start reading from'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(READ_MAX_LIMIT)
    .describe(`Number of lines to read (max ${READ_MAX_LIMIT})`),
});

export const grepArgsSchema = z.object({
  pattern: z
    .string()
    .min(1)
    .describe('Regular expression or literal substring to search for'),
  caseInsensitive: z
    .boolean()
    .optional()
    .describe('When true, match without regard to case (default false)'),
  maxMatches: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe('Maximum matches to return (default 20, max 50)'),
});

export const replaceArgsSchema = z.object({
  old_string: z
    .string()
    .min(1)
    .describe('Exact text to find in the file (must be unique unless replace_all)'),
  new_string: z
    .string()
    .describe('Replacement text'),
  replace_all: z
    .boolean()
    .optional()
    .describe('When true, replace every occurrence of old_string (default false)'),
});

export const yamlParseArgsSchema = z.object({});

import type { TrueColor } from './diffTerminal';

export const colors = {
  banner: 33,
  paletteFg: 37,
  paletteBg: { r: 35, g: 90, b: 175 } satisfies TrueColor,
  cursor: 36,
  thinking: { r: 196, g: 196, b: 196 } satisfies TrueColor,
  text: 37,
  success: 32,
  error: 31,
  stopwatch: 35,
  tokenPrompt: 36,
  tokenCompletion: 33,
  tokenTotal: 32,
  tokenIteration: 37,
} as const;

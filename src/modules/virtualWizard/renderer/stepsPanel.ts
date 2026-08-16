import type { WizardStatePayload } from '../../../cli/jsonl';
import type { DiffTerminal } from '../../../cli/tui/diffTerminal';
import { colors } from '../../../cli/tui/colors';

export const STEPS_PANEL_MIN_WIDTH = 24;

function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  if (max <= 1) {
    return '…';
  }
  return `${text.slice(0, max - 1)}…`;
}

export type StepLineKind = 'title' | 'rule' | 'passed' | 'current' | 'pending' | 'error' | 'empty';

export type StepLine = {
  text: string;
  kind: StepLineKind;
};

export function renderStepLines(state: WizardStatePayload, maxLines: number, width: number): StepLine[] {
  if (maxLines <= 0 || width <= 0) {
    return [];
  }

  const lines: StepLine[] = [
    { text: truncate('Virtual Wizard', width), kind: 'title' },
    { text: truncate('─'.repeat(Math.min(width, 24)), width), kind: 'rule' },
  ];

  if (state.steps.length === 0) {
    lines.push({ text: truncate('Waiting for wizard…', width), kind: 'empty' });
    return lines.slice(0, maxLines);
  }

  for (const [index, step] of state.steps.entries()) {
    const number = `${index + 1}.`;
    const passed = step.validated && index < state.currentIndex;
    const current = index === state.currentIndex;
    const marker = current ? '>' : passed ? '✓' : ' ';
    const text = truncate(`${marker} ${number} ${step.title}`, width);
    let kind: StepLineKind = 'pending';
    if (current && step.validated) {
      kind = 'passed';
    } else if (current) {
      kind = 'current';
    } else if (passed) {
      kind = 'passed';
    }
    lines.push({ text, kind });

    if (current && step.lastError) {
      lines.push({ text: truncate(`  ${step.lastError}`, width), kind: 'error' });
    }
  }

  return lines.slice(0, maxLines);
}

export function paintStepsPanel(
  terminal: DiffTerminal,
  startCol: number,
  width: number,
  maxRows: number,
  state: WizardStatePayload,
): void {
  const lines = renderStepLines(state, maxRows, width);

  for (let row = 0; row < maxRows; row++) {
    const line = lines[row];
    const text = line?.text ?? '';
    const kind = line?.kind ?? 'empty';

    for (let col = 0; col < width; col++) {
      const ch = text[col] ?? ' ';
      let fg: number = colors.text;

      if (kind === 'title') {
        fg = colors.banner;
      } else if (kind === 'passed') {
        fg = colors.success;
      } else if (kind === 'current') {
        fg = colors.cursor;
      } else if (kind === 'error') {
        fg = colors.error;
      }

      terminal.setChar(row, startCol + col, ch, ch === ' ' ? undefined : fg);
    }
  }
}

import { DiffTerminal } from './diffTerminal';

export type SplitColumns = {
  leftWidth: number;
  dividerCol: number;
  rightWidth: number;
};

export function getSplitColumns(totalCols: number, ratio = 0.5): SplitColumns {
  const leftWidth = Math.max(20, Math.floor(totalCols * ratio) - 1);
  const dividerCol = leftWidth;
  const rightWidth = Math.max(20, totalCols - leftWidth - 1);
  return { leftWidth, dividerCol, rightWidth };
}

export function drawVerticalDivider(terminal: DiffTerminal, dividerCol: number): void {
  for (let row = 0; row < terminal.height; row++) {
    terminal.setChar(row, dividerCol, '│');
  }
}

export function composeSplitFrame(
  terminal: DiffTerminal,
  leftLines: string[],
  rightLines: string[],
  ratio = 0.5,
): SplitColumns {
  const { leftWidth, dividerCol, rightWidth } = getSplitColumns(terminal.width, ratio);
  terminal.clear();

  for (let row = 0; row < terminal.height; row++) {
    const left = (leftLines[row] ?? '').slice(0, leftWidth).padEnd(leftWidth);
    terminal.fill(row, 0, left);

    const right = (rightLines[row] ?? '').slice(0, rightWidth).padEnd(rightWidth);
    terminal.fill(row, dividerCol + 1, right);
  }

  drawVerticalDivider(terminal, dividerCol);
  return { leftWidth, dividerCol, rightWidth };
}

export type BottomLayout = {
  contentRows: number;
  inputRow: number;
  paletteRows: number[];
  queueBannerRow: number | null;
};

export function getBottomLayout(
  terminalHeight: number,
  queueLength: number,
  paletteRowCount: number,
): BottomLayout {
  const height = Math.max(1, terminalHeight);
  let row = height - 1;
  const inputRow = row;
  row -= 1;

  const paletteRows: number[] = [];
  const rowsToReserve = Math.max(0, paletteRowCount);
  for (let index = 0; index < rowsToReserve && row >= 0; index++) {
    paletteRows.unshift(row);
    row -= 1;
  }

  let queueBannerRow: number | null = null;
  if (queueLength > 0 && row >= 0) {
    queueBannerRow = row;
    row -= 1;
  }

  return {
    contentRows: Math.max(0, row + 1),
    inputRow,
    paletteRows,
    queueBannerRow,
  };
}

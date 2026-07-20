import { colors } from '../../../cli/tui/colors';

export const STOPWATCH_TIME_WIDTH = 5;
export const STOPWATCH_WIDTH = 1 + STOPWATCH_TIME_WIDTH;

type StopwatchSegment = { text: string; fg?: number };

function padTimeField(value: string): string {
  return value.padStart(STOPWATCH_TIME_WIDTH, ' ');
}

export function formatElapsedMs(ms: number): string {
  const elapsed = Math.max(0, ms);
  const sec = Math.floor(elapsed / 1000);
  const tenths = Math.floor((elapsed % 1000) / 100);

  if (sec < 60) {
    const core = sec < 10 ? `${sec}.${tenths}` : `${String(sec).padStart(2, '0')}.${tenths}`;
    return padTimeField(core);
  }

  if (sec < 3600) {
    const minutes = Math.floor(sec / 60);
    const seconds = sec % 60;
    return padTimeField(`${minutes}:${String(seconds).padStart(2, '0')}`);
  }

  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  return padTimeField(`${hours}:${String(minutes).padStart(2, '0')}`);
}

export function stopwatchSegments(elapsedMs: number): StopwatchSegment[] {
  return [
    { text: '⏱', fg: colors.stopwatch },
    { text: formatElapsedMs(elapsedMs), fg: colors.stopwatch },
  ];
}

export function formatStopwatch(elapsedMs: number): string {
  return stopwatchSegments(elapsedMs).map((segment) => segment.text).join('');
}

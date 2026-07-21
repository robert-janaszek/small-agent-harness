import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Max pre-edit snapshots retained; oldest entries are dropped first. */
export const HISTORY_MAX_SIZE = 50;

export type YamlRepairContext = {
  filePath: string;
  /** Number of undoable pre-edit snapshots. */
  historyLength: () => number;
  pushSnapshot: (content: string) => void;
  peekSnapshot: () => string | undefined;
  popSnapshot: () => string | undefined;
  clearHistory: () => void;
  /** Remove the temp work directory when this context owns one; otherwise a no-op. */
  dispose: () => void;
};

export type WorkFile = {
  filePath: string;
  dispose: () => void;
};

const FIXTURE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'broken.yaml',
);

export function getFixturePath(): string {
  return FIXTURE_PATH;
}

function createHistoryStack(): Pick<
  YamlRepairContext,
  'historyLength' | 'pushSnapshot' | 'peekSnapshot' | 'popSnapshot' | 'clearHistory'
> {
  const history: string[] = [];

  return {
    historyLength() {
      return history.length;
    },
    pushSnapshot(content: string) {
      history.push(content);
      if (history.length > HISTORY_MAX_SIZE) {
        history.shift();
      }
    },
    peekSnapshot() {
      return history.at(-1);
    },
    popSnapshot() {
      return history.pop();
    },
    clearHistory() {
      history.length = 0;
    },
  };
}

/** Copy the broken fixture into a unique temp work file so the source stays intact. */
export function createWorkFile(sourcePath: string = FIXTURE_PATH): WorkFile {
  const dir = mkdtempSync(join(tmpdir(), 'yaml-repair-'));
  const workPath = join(dir, 'broken.work.yaml');
  copyFileSync(sourcePath, workPath);
  return {
    filePath: workPath,
    dispose: () => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function createContext(filePath?: string): YamlRepairContext {
  const stack = createHistoryStack();

  if (filePath !== undefined) {
    return {
      filePath,
      ...stack,
      dispose: () => {
        stack.clearHistory();
      },
    };
  }

  const work = createWorkFile();
  return {
    filePath: work.filePath,
    ...stack,
    dispose: () => {
      stack.clearHistory();
      work.dispose();
    },
  };
}

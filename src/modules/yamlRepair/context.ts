import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Max pre-edit snapshots retained; oldest entries are dropped first. */
export const HISTORY_MAX_SIZE = 50;

export type EditHistory = {
  length: () => number;
  push: (content: string) => void;
  peek: () => string | undefined;
  pop: () => string | undefined;
  clear: () => void;
};

export type YamlRepairContext = {
  filePath: string;
  history: EditHistory;
  /** Error count from the previous yamlParse call, or null before the first parse. */
  lastParseErrorCount: number | null;
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

function createHistoryStack(): EditHistory {
  const snapshots: string[] = [];

  return {
    length() {
      return snapshots.length;
    },
    push(content: string) {
      snapshots.push(content);
      if (snapshots.length > HISTORY_MAX_SIZE) {
        snapshots.shift();
      }
    },
    peek() {
      return snapshots.at(-1);
    },
    pop() {
      return snapshots.pop();
    },
    clear() {
      snapshots.length = 0;
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
  const history = createHistoryStack();

  if (filePath !== undefined) {
    return {
      filePath,
      history,
      lastParseErrorCount: null,
      dispose: () => {
        history.clear();
      },
    };
  }

  const work = createWorkFile();
  return {
    filePath: work.filePath,
    history,
    lastParseErrorCount: null,
    dispose: () => {
      history.clear();
      work.dispose();
    },
  };
}

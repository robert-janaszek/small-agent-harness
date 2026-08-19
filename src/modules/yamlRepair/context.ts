import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

export type ParseStatusState = {
  errorCount: number | null;
  ok: boolean;
  errors: string[];
  undoHint: string | null;
};

export type YamlRepairStateSnapshot = {
  filePath: string;
  parseStatus: ParseStatusState;
};

export type YamlRepairContext = {
  filePath: string;
  history: EditHistory;
  parseStatus: ParseStatusState;
  /** Error count from the previous yamlParse call, or null before the first parse. */
  lastParseErrorCount: number | null;
  /** File contents captured when the context was created; used by reset. */
  initialContent: string;
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

export function createParseStatusState(): ParseStatusState {
  return {
    errorCount: null,
    ok: false,
    errors: [],
    undoHint: null,
  };
}

export function snapshotYamlRepairState(context: YamlRepairContext): YamlRepairStateSnapshot {
  return {
    filePath: context.filePath,
    parseStatus: {
      errorCount: context.parseStatus.errorCount,
      ok: context.parseStatus.ok,
      errors: [...context.parseStatus.errors],
      undoHint: context.parseStatus.undoHint,
    },
  };
}

export function logWorkFilePath(context: YamlRepairContext): void {
  process.stderr.write(`[yamlRepair] work file: ${context.filePath}\n`);
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

/** Restore the work file to the contents captured when the context was created. */
export function resetContext(context: YamlRepairContext): void {
  writeFileSync(context.filePath, context.initialContent, 'utf8');
  context.history.clear();
  context.lastParseErrorCount = null;
  context.parseStatus = createParseStatusState();
}

export function createContext(filePath?: string): YamlRepairContext {
  const history = createHistoryStack();

  if (filePath !== undefined) {
    return {
      filePath,
      history,
      parseStatus: createParseStatusState(),
      lastParseErrorCount: null,
      initialContent: readFileSync(filePath, 'utf8'),
      dispose: () => {
        history.clear();
      },
    };
  }

  const work = createWorkFile();
  return {
    filePath: work.filePath,
    history,
    parseStatus: createParseStatusState(),
    lastParseErrorCount: null,
    initialContent: readFileSync(work.filePath, 'utf8'),
    dispose: () => {
      history.clear();
      work.dispose();
    },
  };
}

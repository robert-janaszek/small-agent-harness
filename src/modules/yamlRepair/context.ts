import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type YamlRepairContext = {
  filePath: string;
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
  if (filePath !== undefined) {
    return {
      filePath,
      dispose: () => {},
    };
  }

  const work = createWorkFile();
  return {
    filePath: work.filePath,
    dispose: work.dispose,
  };
}

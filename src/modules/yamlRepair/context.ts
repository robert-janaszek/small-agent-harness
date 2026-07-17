import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type YamlRepairContext = {
  filePath: string;
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
export function createWorkFile(sourcePath: string = FIXTURE_PATH): string {
  const dir = mkdtempSync(join(tmpdir(), 'yaml-repair-'));
  const workPath = join(dir, 'broken.work.yaml');
  copyFileSync(sourcePath, workPath);
  return workPath;
}

export function createContext(filePath?: string): YamlRepairContext {
  return {
    filePath: filePath ?? createWorkFile(),
  };
}

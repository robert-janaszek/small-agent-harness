import { emit } from '../../cli/jsonl';
import type { YamlRepairContext } from './context';

export function logWorkFilePath(context: YamlRepairContext): void {
  process.stderr.write(`[yamlRepair] work file: ${context.filePath}\n`);
}

export function emitYamlRepairWorkFile(context: YamlRepairContext): void {
  emit({ type: 'work_file', path: context.filePath });
}

/** Empty context_init keeps the legacy harness JSONL contract aligned with spawn clients. */
export function emitYamlRepairContextInit(): void {
  emit({ type: 'context_init', changes: [] });
}

export function emitYamlRepairSessionStart(context: YamlRepairContext): void {
  logWorkFilePath(context);
  emitYamlRepairWorkFile(context);
  emitYamlRepairContextInit();
}

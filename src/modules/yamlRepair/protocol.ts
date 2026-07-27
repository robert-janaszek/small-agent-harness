import { emit } from '../../cli/jsonl';
import type { YamlRepairContext } from './context';

export function logWorkFilePath(context: YamlRepairContext): void {
  process.stderr.write(`[yamlRepair] work file: ${context.filePath}\n`);
}

/** Empty context_init keeps the harness JSONL contract aligned with smart-home clients. */
export function emitYamlRepairContextInit(): void {
  emit({ type: 'context_init', changes: [] });
}

export function emitYamlRepairSessionStart(context: YamlRepairContext): void {
  logWorkFilePath(context);
  emitYamlRepairContextInit();
}

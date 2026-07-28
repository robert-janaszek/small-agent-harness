import { YAML_REPAIR_DEFAULT_COMMAND } from '../modules/yamlRepair/defaultCommand';

export type YamlRepairCliMode = 'batch' | 'repl' | 'serve';

type YamlRepairArgvResult = {
  mode: YamlRepairCliMode;
  command: string;
  human: boolean;
};

export function parseYamlRepairArgv(argv: string[]): YamlRepairArgvResult {
  const human = argv.includes('--human');
  const filtered = argv.filter((arg) => arg !== '--human');
  const hasServe = filtered.includes('--serve');
  const hasDefault = filtered.includes('--default');
  const positionalArgs = filtered.filter((arg) => arg !== '--serve' && arg !== '--default');
  const batchCommand = positionalArgs.join(' ').trim();

  if (hasServe && hasDefault) {
    throw new Error('`--serve` cannot be combined with `--default`.');
  }

  if (hasServe && human) {
    throw new Error('`--serve` cannot be combined with `--human`.');
  }

  if (hasServe && batchCommand.length > 0) {
    throw new Error('`--serve` cannot be combined with a batch command.');
  }

  if (hasDefault) {
    if (batchCommand.length > 0) {
      throw new Error('`--default` cannot be combined with a custom command.');
    }
    return { mode: 'batch', command: YAML_REPAIR_DEFAULT_COMMAND, human };
  }

  if (hasServe) {
    return { mode: 'serve', command: '', human };
  }

  if (batchCommand.length > 0) {
    return { mode: 'batch', command: batchCommand, human };
  }

  return { mode: 'repl', command: '', human };
}

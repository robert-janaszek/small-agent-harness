import { YAML_REPAIR_DEFAULT_COMMAND } from '../modules/yamlRepair/defaultCommand';

export type YamlRepairCliMode = 'batch' | 'repl' | 'serve';

export function parseYamlRepairArgv(argv: string[]): {
  mode: YamlRepairCliMode;
  command: string;
  human: boolean;
} {
  const human = argv.includes('--human');
  const filtered = argv.filter((arg) => arg !== '--human');

  if (filtered.includes('--default')) {
    const withoutDefault = filtered.filter((arg) => arg !== '--default');
    if (withoutDefault.length > 0) {
      return { mode: 'batch', command: withoutDefault.join(' ').trim(), human };
    }
    return { mode: 'batch', command: YAML_REPAIR_DEFAULT_COMMAND, human };
  }

  if (filtered.includes('--serve')) {
    return { mode: 'serve', command: '', human };
  }

  const batchCommand = filtered.join(' ').trim();
  if (batchCommand.length > 0) {
    return { mode: 'batch', command: batchCommand, human };
  }

  return { mode: 'repl', command: '', human };
}

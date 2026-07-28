import { HarnessSessionClient } from '../../../cli/harnessClient';

export class YamlRepairHarnessClient extends HarnessSessionClient {
  constructor() {
    super({ entry: 'src/cli/yamlRepair.ts', extraArgs: ['--serve'] });
  }
}

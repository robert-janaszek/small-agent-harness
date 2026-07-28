import { HarnessSessionClient } from '../../../cli/harnessClient';

export class SmartHomeHarnessClient extends HarnessSessionClient {
  constructor() {
    super({ entry: 'src/cli/main.ts', extraArgs: ['--serve'] });
  }
}

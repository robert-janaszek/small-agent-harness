import { HarnessSessionClient } from '../../../cli/harnessClient';

export class VirtualWizardHarnessClient extends HarnessSessionClient {
  constructor() {
    super({ entry: 'src/cli/virtualWizard.ts', extraArgs: ['--serve'] });
  }
}

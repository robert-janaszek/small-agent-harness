import { emit } from '../../cli/jsonl';
import { snapshotWizardState, type WizardContext } from './context';

export function emitWizardState(context: WizardContext): void {
  emit({ type: 'wizard_state', ...snapshotWizardState(context) });
}

export function emitVirtualWizardContextInit(context: WizardContext): void {
  emit({ type: 'context_init', changes: [] });
  emitWizardState(context);
}

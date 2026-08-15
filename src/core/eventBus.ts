import type { CoreEvent, EmitFn } from './protocol';

export type EventBus = {
  emit(event: CoreEvent): void;
  subscribe(listener: EmitFn): () => void;
};

export function createEventBus(): EventBus {
  const listeners = new Set<EmitFn>();

  return {
    emit(event) {
      for (const listener of [...listeners]) {
        try {
          listener(event);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          process.stderr.write(`[eventBus] listener error: ${message}\n`);
        }
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

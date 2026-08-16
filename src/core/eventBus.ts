import type { CoreEvent, EmitFn } from './protocol';

export type EventBus = {
  emit(event: CoreEvent): void;
  subscribe(listener: EmitFn): () => void;
  close(): void;
};

export function createEventBus(): EventBus {
  const listeners = new Set<EmitFn>();
  let closed = false;

  return {
    emit(event) {
      if (closed) {
        return;
      }

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
    close() {
      closed = true;
    },
  };
}

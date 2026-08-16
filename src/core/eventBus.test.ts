import { describe, it, expect, vi } from 'vitest';

import { createEventBus } from './eventBus';
import { createStdoutEmit, type CoreEvent } from './protocol';

describe('EventBus', () => {
  it('delivers events to all subscribers', () => {
    const bus = createEventBus();
    const first: CoreEvent[] = [];
    const second: CoreEvent[] = [];

    bus.subscribe((event) => first.push(event));
    bus.subscribe((event) => second.push(event));

    const event: CoreEvent = { type: 'user_command', command: 'hello' };
    bus.emit(event);

    expect(first).toEqual([event]);
    expect(second).toEqual([event]);
  });

  it('stops delivering after unsubscribe', () => {
    const bus = createEventBus();
    const events: CoreEvent[] = [];
    const unsubscribe = bus.subscribe((event) => events.push(event));

    bus.emit({ type: 'user_command', command: 'one' });
    unsubscribe();
    bus.emit({ type: 'user_command', command: 'two' });

    expect(events).toEqual([{ type: 'user_command', command: 'one' }]);
  });

  it('keeps notifying remaining listeners when one throws', () => {
    const bus = createEventBus();
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const events: CoreEvent[] = [];

    bus.subscribe(() => {
      throw new Error('boom');
    });
    bus.subscribe((event) => events.push(event));

    bus.emit({ type: 'error', message: 'later' });

    expect(events).toEqual([{ type: 'error', message: 'later' }]);
    expect(stderrWrite).toHaveBeenCalledWith('[eventBus] listener error: boom\n');
    stderrWrite.mockRestore();
  });

  it('drops events after close', () => {
    const bus = createEventBus();
    const events: CoreEvent[] = [];
    bus.subscribe((event) => events.push(event));

    bus.emit({ type: 'user_command', command: 'before' });
    bus.close();
    bus.emit({ type: 'error', message: 'after' });
    bus.close();

    expect(events).toEqual([{ type: 'user_command', command: 'before' }]);
  });
});

describe('JSONL subscriber', () => {
  it('encodes bus events as JSON lines', () => {
    const bus = createEventBus();
    const lines: string[] = [];
    bus.subscribe(createStdoutEmit((line) => lines.push(line)));

    bus.emit({ type: 'ready', protocolVersion: 1 });

    expect(lines).toEqual(['{"type":"ready","protocolVersion":1}\n']);
  });
});

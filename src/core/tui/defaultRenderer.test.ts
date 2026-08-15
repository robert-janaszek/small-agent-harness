import { describe, it, expect, vi } from 'vitest';

import { DiffTerminal } from '../../cli/tui/diffTerminal';
import { createEventBus } from '../eventBus';
import { Harness } from '../harness';
import type { HarnessConfig } from '../../harness/harness.config.validate';
import type { ModulePanel, PanelPaintContext } from '../module';
import { DefaultRenderer, paintNoModulePanel } from './defaultRenderer';
import { getBottomLayout } from './layout';

const testConfig: HarnessConfig = {
  openaiBaseUrl: 'http://127.0.0.1:1234/v1',
  openaiApiKey: 'test-key',
  modelName: 'test-model',
  maxIterations: 3,
};

function visibleText(output: string): string {
  return output.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
}

describe('getBottomLayout', () => {
  it('reserves only the input row when chrome is inactive', () => {
    expect(getBottomLayout(10, 0, 0)).toEqual({
      contentRows: 9,
      inputRow: 9,
      paletteRows: [],
      queueBannerRow: null,
    });
  });

  it('stacks palette rows above input and queue above palette', () => {
    expect(getBottomLayout(10, 2, 2)).toEqual({
      contentRows: 6,
      inputRow: 9,
      paletteRows: [7, 8],
      queueBannerRow: 6,
    });
  });
});

describe('paintNoModulePanel', () => {
  it('writes the placeholder label', () => {
    const output: string[] = [];
    const terminal = new DiffTerminal(8, 40, (chunk) => output.push(chunk));
    paintNoModulePanel(terminal, 20, 20, 7);
    terminal.flush();

    expect(visibleText(output.join(''))).toContain('no module');
  });
});

describe('DefaultRenderer', () => {
  it('paints the event log and no-module placeholder from bus events', async () => {
    const output: string[] = [];
    const terminal = new DiffTerminal(12, 80, (chunk) => output.push(chunk));
    const bus = createEventBus();
    const createChatCompletion = vi.fn().mockResolvedValue({
      choices: [{ message: { role: 'assistant', content: '4', refusal: null } }],
      usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
    });
    const harness = new Harness({
      modules: [],
      llmClient: { createChatCompletion },
      config: testConfig,
      bus,
    });
    const renderer = new DefaultRenderer(terminal, harness, bus);

    harness.startSession();
    await harness.run('what is 2+2');

    output.length = 0;
    terminal.resize(12, 80);
    renderer.refresh();

    const text = visibleText(output.join(''));
    expect(text).toContain('> what is 2+2');
    expect(text).toContain('agent: 4');
    expect(text).toContain('no module');
    expect(text).toContain('[✓]');
    expect(text).toContain('⏱');
    expect(text).toContain('↑');
    expect(text).toContain('Σ');
  });

  it('clears the log on /clear and resets harness history on /reset', async () => {
    const output: string[] = [];
    const terminal = new DiffTerminal(12, 80, (chunk) => output.push(chunk));
    const bus = createEventBus();
    const createChatCompletion = vi.fn().mockResolvedValue({
      choices: [{ message: { role: 'assistant', content: 'ok', refusal: null } }],
    });
    const harness = new Harness({
      modules: [],
      llmClient: { createChatCompletion },
      config: testConfig,
      bus,
    });
    const renderer = new DefaultRenderer(terminal, harness, bus);

    await renderer.handleInput('hello');
    expect(harness.getTurnCount()).toBe(1);

    output.length = 0;
    await renderer.handleInput('/clear');
    expect(visibleText(output.join(''))).not.toContain('> hello');

    await renderer.handleInput('/reset');
    expect(harness.getTurnCount()).toBe(0);
    expect(harness.getMessageHistory()).toEqual([]);
  });

  it('ends the harness session on /exit', async () => {
    const events: Array<{ type: string }> = [];
    const terminal = new DiffTerminal(12, 80, () => {});
    const bus = createEventBus();
    bus.subscribe((event) => events.push(event));
    const harness = new Harness({
      modules: [],
      llmClient: { createChatCompletion: vi.fn() },
      config: testConfig,
      bus,
    });
    const renderer = new DefaultRenderer(terminal, harness, bus);

    await renderer.handleInput('/exit');

    expect(events.some((event) => event.type === 'session_end')).toBe(true);
  });

  it('does not flash a pending-task banner when submitting while idle', async () => {
    const output: string[] = [];
    const terminal = new DiffTerminal(12, 80, (chunk) => output.push(chunk));
    const bus = createEventBus();
    const createChatCompletion = vi.fn().mockResolvedValue({
      choices: [{ message: { role: 'assistant', content: 'ok', refusal: null } }],
    });
    const harness = new Harness({
      modules: [],
      llmClient: { createChatCompletion },
      config: testConfig,
      bus,
    });
    const renderer = new DefaultRenderer(terminal, harness, bus);

    await renderer.handleInput('hello');

    expect(visibleText(output.join(''))).not.toContain('pending');
  });

  it('shows the pending banner only when a turn is already running', async () => {
    const output: string[] = [];
    const terminal = new DiffTerminal(12, 80, (chunk) => output.push(chunk));
    const bus = createEventBus();
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    const createChatCompletion = vi.fn().mockImplementation(async () => {
      started();
      await blocked;
      return { choices: [{ message: { role: 'assistant', content: 'ok', refusal: null } }] };
    });
    const harness = new Harness({
      modules: [],
      llmClient: { createChatCompletion },
      config: testConfig,
      bus,
    });
    const renderer = new DefaultRenderer(terminal, harness, bus);

    const first = renderer.handleInput('slow');
    await startedPromise;
    output.length = 0;
    void renderer.handleInput('next');

    expect(visibleText(output.join(''))).toContain('pending');
    release();
    await first;
  });

  it('paints a module panel instead of the placeholder and forwards module events', () => {
    const output: string[] = [];
    const terminal = new DiffTerminal(12, 80, (chunk) => output.push(chunk));
    const bus = createEventBus();
    let label = 'dummy-panel';
    const panel: ModulePanel = {
      onEvent(event, payload) {
        if (event === 'label' && typeof payload === 'string') {
          label = payload;
        }
      },
      paint({ terminal: pane, startCol, width }: PanelPaintContext) {
        const text = label.slice(0, width);
        for (let index = 0; index < text.length; index++) {
          pane.setChar(0, startCol + index, text[index] ?? ' ');
        }
      },
    };
    const harness = new Harness({
      modules: [],
      llmClient: { createChatCompletion: vi.fn() },
      config: testConfig,
      bus,
    });
    const renderer = new DefaultRenderer(terminal, harness, bus, { panel });

    harness.startSession();
    bus.emit({ type: 'module', module: 'dummy', event: 'label', payload: 'from-event' });

    output.length = 0;
    terminal.resize(12, 80);
    renderer.refresh();

    const text = visibleText(output.join(''));
    expect(text).toContain('from-event');
    expect(text).not.toContain('no module');
  });

  it('resolves run() when /exit is entered', async () => {
    const originalIsTTY = process.stdin.isTTY;
    const originalSetRawMode = process.stdin.setRawMode;
    const originalPause = process.stdin.pause;
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    process.stdin.setRawMode = vi.fn() as typeof process.stdin.setRawMode;
    process.stdin.pause = vi.fn() as typeof process.stdin.pause;

    try {
      const terminal = new DiffTerminal(12, 80, () => {});
      const bus = createEventBus();
      const harness = new Harness({
        modules: [],
        llmClient: { createChatCompletion: vi.fn() },
        config: testConfig,
        bus,
      });
      const renderer = new DefaultRenderer(terminal, harness, bus);
      const running = renderer.run();
      await renderer.handleInput('/exit');
      await expect(running).resolves.toBe(0);
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
      process.stdin.setRawMode = originalSetRawMode;
      process.stdin.pause = originalPause;
      process.stdin.removeAllListeners('data');
    }
  });
});

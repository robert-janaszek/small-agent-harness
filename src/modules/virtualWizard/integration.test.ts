import { afterEach, describe, expect, it, vi } from 'vitest';
import OpenAI from 'openai';

import type { ChatCompletionClient } from '../../client/llmClient.type';
import { createEventBus } from '../../core/eventBus';
import { Harness } from '../../core/harness';
import type { CoreEvent } from '../../core/protocol';
import type { HarnessConfig } from '../../harness/harness.config.validate';
import { createVirtualWizardModule, VIRTUAL_WIZARD_MODULE_ID } from './module';

const testConfig: HarnessConfig = {
  openaiBaseUrl: 'http://127.0.0.1:1234/v1',
  openaiApiKey: 'test-key',
  modelName: 'test-model',
  maxIterations: 20,
};

function assistantMessage(content: string): OpenAI.Chat.Completions.ChatCompletionMessage {
  return { role: 'assistant', content, refusal: null };
}

function assistantToolCall(
  name: string,
  args: Record<string, unknown>,
  id: string,
): OpenAI.Chat.Completions.ChatCompletionMessage {
  return {
    role: 'assistant',
    content: null,
    refusal: null,
    tool_calls: [
      {
        id,
        type: 'function',
        function: {
          name,
          arguments: JSON.stringify(args),
        },
      },
    ],
  };
}

function completion(message: OpenAI.Chat.Completions.ChatCompletionMessage) {
  return { choices: [{ message }] };
}

describe('virtualWizard integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('walks the wizard through mocked tool calls until complete', async () => {
    const module = createVirtualWizardModule();
    const createChatCompletion = vi
      .fn()
      .mockResolvedValueOnce(completion(assistantToolCall('validateCurrentStep', {}, 'c1')))
      .mockResolvedValueOnce(completion(assistantToolCall('nextStep', {}, 'c2')))
      .mockResolvedValueOnce(
        completion(
          assistantToolCall(
            'validateCurrentStep',
            { name: 'Ada Lovelace', email: 'ada@example.com' },
            'c3',
          ),
        ),
      )
      .mockResolvedValueOnce(completion(assistantToolCall('nextStep', {}, 'c4')))
      .mockResolvedValueOnce(completion(assistantToolCall('validateCurrentStep', { plan: 'pro' }, 'c5')))
      .mockResolvedValueOnce(completion(assistantToolCall('nextStep', {}, 'c6')))
      .mockResolvedValueOnce(completion(assistantToolCall('validateCurrentStep', {}, 'c7')))
      .mockResolvedValueOnce(completion(assistantMessage('All wizard steps are done.')));

    const events: CoreEvent[] = [];
    const bus = createEventBus();
    bus.subscribe((event) => events.push(event));
    const llmClient: ChatCompletionClient = { createChatCompletion };
    const harness = new Harness({ modules: [module], llmClient, config: testConfig, bus });
    harness.startSession();

    const result = await harness.run('Complete the wizard.');

    expect(result.content).toBe('All wizard steps are done.');
    expect(module.context.currentIndex).toBe(3);
    expect(module.context.steps.every((step) => step.validated)).toBe(true);

    const stateEvents = events.filter(
      (event): event is Extract<CoreEvent, { type: 'module' }> =>
        event.type === 'module' && event.module === VIRTUAL_WIZARD_MODULE_ID && event.event === 'state',
    );
    expect(stateEvents.length).toBeGreaterThan(1);
    expect(stateEvents.at(-1)?.payload).toMatchObject({
      currentIndex: 3,
      steps: expect.arrayContaining([expect.objectContaining({ title: 'Confirm', validated: true })]),
    });
  });

  it('blocks nextStep in a mocked turn when validation was skipped', async () => {
    const module = createVirtualWizardModule();
    const createChatCompletion = vi
      .fn()
      .mockResolvedValueOnce(completion(assistantToolCall('nextStep', {}, 'c1')))
      .mockResolvedValueOnce(completion(assistantMessage('I could not advance yet.')));

    const llmClient: ChatCompletionClient = { createChatCompletion };
    const harness = new Harness({ modules: [module], llmClient, config: testConfig });

    await harness.run('Go to the next step.');

    expect(module.context.currentIndex).toBe(0);
    expect(module.context.steps[0]?.validated).toBe(false);
  });
});

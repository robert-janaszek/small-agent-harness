import { describe, expect, it, vi } from 'vitest';
import OpenAI from 'openai';

import type { ChatCompletionClient } from '../../client/llmClient.type';
import { Harness } from '../../harness/harness';
import type { HarnessConfig } from '../../harness/harness.config.validate';
import { createYamlRepairAgent } from './agent';
import { createWorkFile, getFixturePath } from './context';
import { readFileText } from './fileOps';

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

describe('yamlRepair integration', () => {
  it('repairs the work file through mocked tool calls until parse succeeds', async () => {
    const work = createWorkFile(getFixturePath());
    const agent = createYamlRepairAgent(work);

    const createChatCompletion = vi
      .fn()
      .mockResolvedValueOnce(completion(assistantToolCall('yamlParse', {}, 'c1')))
      .mockResolvedValueOnce(
        completion(
          assistantToolCall(
            'replace',
            { old_string: '        group lights', new_string: '        group: lights' },
            'c2',
          ),
        ),
      )
      .mockResolvedValueOnce(
        completion(
          assistantToolCall(
            'replace',
            { old_string: '        speedLevels 3', new_string: '        speedLevels: 3' },
            'c3',
          ),
        ),
      )
      .mockResolvedValueOnce(
        completion(
          assistantToolCall(
            'replace',
            { old_string: '        unit celsius', new_string: '        unit: celsius' },
            'c4',
          ),
        ),
      )
      .mockResolvedValueOnce(
        completion(
          assistantToolCall(
            'replace',
            { old_string: '        protocol zwave', new_string: '        protocol: zwave' },
            'c5',
          ),
        ),
      )
      .mockResolvedValueOnce(
        completion(
          assistantToolCall(
            'replace',
            {
              old_string: '        group patio_fans_WRONG',
              new_string: '        group: fans',
            },
            'c6',
          ),
        ),
      )
      .mockResolvedValueOnce(
        completion(
          assistantToolCall(
            'replace',
            {
              old_string: '        group covers\n        deviceId:',
              new_string: '        group: covers\n        deviceId:',
            },
            'c7',
          ),
        ),
      )
      .mockResolvedValueOnce(
        completion(
          assistantToolCall(
            'replace',
            {
              old_string: 'protocol: __FILL_FROM_CONTEXT__',
              new_string: 'protocol: zigbee',
              replace_all: true,
            },
            'c8',
          ),
        ),
      )
      .mockResolvedValueOnce(
        completion(
          assistantToolCall(
            'replace',
            {
              old_string: 'defaultState: __FILL_FROM_CONTEXT__',
              new_string: 'defaultState: OFF',
              replace_all: true,
            },
            'c9',
          ),
        ),
      )
      .mockResolvedValueOnce(
        completion(
          assistantToolCall(
            'replace',
            {
              old_string: 'wattage: __FILL_FROM_CONTEXT__',
              new_string: 'wattage: 9',
              replace_all: true,
            },
            'c10',
          ),
        ),
      )
      .mockResolvedValueOnce(
        completion(
          assistantToolCall(
            'replace',
            {
              old_string: 'state: __FILL_FROM_CONTEXT__',
              new_string: 'state: OFF',
              replace_all: true,
            },
            'c11',
          ),
        ),
      )
      .mockResolvedValueOnce(completion(assistantToolCall('yamlParse', {}, 'c12')))
      .mockResolvedValueOnce(
        completion(assistantMessage('The YAML work file parses successfully and placeholders are filled.')),
      );

    const llmClient: ChatCompletionClient = { createChatCompletion };
    const harness = new Harness(agent, { llmClient, config: testConfig });
    const result = await harness.run('Repair the YAML file');

    expect(result.content).toContain('parses successfully');
    expect(readFileText(work)).not.toMatch(/: __FILL_FROM_CONTEXT__/);
    expect(readFileText(work)).not.toContain('group lights');
    expect(readFileText(getFixturePath())).toContain('group lights');
  });
});

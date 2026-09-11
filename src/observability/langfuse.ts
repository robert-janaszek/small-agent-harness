import { randomUUID } from 'node:crypto';

import { LangfuseSpanProcessor } from '@langfuse/otel';
import {
  propagateAttributes,
  startActiveObservation,
  type LangfuseGenerationAttributes,
} from '@langfuse/tracing';
import { NodeSDK } from '@opentelemetry/sdk-node';

import { loadEnv } from '../core/loadEnv';

export type ObservationHandle = {
  update: (attributes: { input?: unknown; output?: unknown; metadata?: Record<string, unknown> }) => void;
};

export type GenerationObservationHandle = {
  update: (attributes: LangfuseGenerationAttributes) => void;
};

let initialized = false;
let spanProcessor: LangfuseSpanProcessor | undefined;
let sdk: NodeSDK | undefined;

export function isLangfuseEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const enabledFlag = env.LANGFUSE_ENABLED?.trim().toLowerCase() ?? '';
  if (enabledFlag === '0' || enabledFlag === 'false' || enabledFlag === 'no' || enabledFlag === 'off') {
    return false;
  }

  const publicKey = env.LANGFUSE_PUBLIC_KEY?.trim() ?? '';
  const secretKey = env.LANGFUSE_SECRET_KEY?.trim() ?? '';
  return publicKey.length > 0 && secretKey.length > 0;
}

export function createLangfuseSessionId(): string {
  return randomUUID();
}

export function initLangfuseTracing(): void {
  loadEnv();
  if (initialized) {
    return;
  }
  initialized = true;

  if (!isLangfuseEnabled()) {
    return;
  }

  spanProcessor = new LangfuseSpanProcessor();
  sdk = new NodeSDK({
    spanProcessors: [spanProcessor],
  });
  sdk.start();
}

const DEFAULT_FLUSH_TIMEOUT_MS = 1_000;

function sleepUnref(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  });
}

export async function flushLangfuse(timeoutMs = DEFAULT_FLUSH_TIMEOUT_MS): Promise<void> {
  if (!spanProcessor || timeoutMs <= 0) {
    return;
  }

  try {
    await Promise.race([spanProcessor.forceFlush(), sleepUnref(timeoutMs)]);
  } catch {
    // Observability must not fail a successful harness run (e.g. revoked Langfuse keys).
  }
}

export async function shutdownLangfuse(): Promise<void> {
  await spanProcessor?.forceFlush();
  await sdk?.shutdown();
  spanProcessor = undefined;
  sdk = undefined;
}

/** @internal test helper */
export function resetLangfuseTracingForTests(): void {
  initialized = false;
  spanProcessor = undefined;
  sdk = undefined;
}

/** @internal test helper */
export function installLangfuseProcessorForTests(processor: { forceFlush(): Promise<void> }): void {
  spanProcessor = processor as LangfuseSpanProcessor;
}

export async function withAgentObservation<T>(
  params: {
    name?: string;
    sessionId: string;
    input: unknown;
  },
  fn: (observation: ObservationHandle) => Promise<T>,
): Promise<T> {
  if (!isLangfuseEnabled()) {
    return fn({ update: () => {} });
  }

  const name = params.name ?? 'harness-turn';

  return propagateAttributes({ sessionId: params.sessionId, traceName: name }, () =>
    startActiveObservation(
      name,
      async (agent) => {
        agent.update({ input: params.input });
        return fn({
          update: (attributes) => {
            agent.update(attributes);
          },
        });
      },
      { asType: 'agent' },
    ),
  );
}

export async function withToolObservation<T>(
  params: {
    name: string;
    input: unknown;
  },
  fn: () => Promise<T>,
): Promise<T> {
  if (!isLangfuseEnabled()) {
    return fn();
  }

  return startActiveObservation(
    params.name,
    async (tool) => {
      tool.update({ input: params.input });
      const result = await fn();
      tool.update({ output: result });
      return result;
    },
    { asType: 'tool' },
  );
}

export async function withGenerationObservation<T>(
  params: {
    name?: string;
    input: unknown;
    model?: string;
    modelParameters?: LangfuseGenerationAttributes['modelParameters'];
    metadata?: Record<string, unknown>;
  },
  fn: (observation: GenerationObservationHandle) => Promise<T>,
): Promise<T> {
  if (!isLangfuseEnabled()) {
    return fn({ update: () => {} });
  }

  const name = params.name ?? 'chat-completion';

  return startActiveObservation(
    name,
    async (generation) => {
      generation.update({
        input: params.input,
        model: params.model,
        modelParameters: params.modelParameters,
        metadata: params.metadata,
      });
      try {
        return await fn({
          update: (attributes) => {
            generation.update(attributes);
          },
        });
      } catch (error) {
        generation.update({
          level: 'ERROR',
          statusMessage: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    { asType: 'generation' },
  );
}

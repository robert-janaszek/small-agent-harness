export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(toAbortError(signal));
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    if (typeof timer.unref === 'function') {
      timer.unref();
    }

    function onAbort() {
      clearTimeout(timer);
      reject(toAbortError(signal));
    }

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function toAbortError(signal?: AbortSignal): Error {
  if (signal?.reason instanceof Error) {
    return signal.reason;
  }

  const error = new Error('This operation was aborted');
  error.name = 'AbortError';
  return error;
}

function isDisabledFlag(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase() ?? '';
  return normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off';
}

export function formatHarnessError(error: unknown): string {
  if (error instanceof AggregateError) {
    const messages = error.errors
      .map((entry) => (entry instanceof Error ? entry.message : String(entry)))
      .filter((message) => message.length > 0);

    if (messages.length > 0) {
      return messages.join('; ');
    }

    return 'AggregateError';
  }

  if (error instanceof Error) {
    if (error.message.length > 0) {
      return error.message;
    }

    return error.name || 'Error';
  }

  if (typeof error === 'string' && error.length > 0) {
    return error;
  }

  return 'Unknown error';
}

export { isDisabledFlag };

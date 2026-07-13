import { describe, it, expect, vi, afterEach } from 'vitest';

import { createContext, createPrintContext } from './context';
import { setAcPower } from './devices';

describe('createPrintContext', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows AC as green when power is ON', () => {
    const context = createContext();
    setAcPower(context, { room: 'livingRoom', deviceId: '1' }, 'ON');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    createPrintContext(context)();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('\x1b[32m●\x1b[0m ac / livingRoom / 1'));
  });

  it('shows AC as red when power is OFF', () => {
    const context = createContext();

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    createPrintContext(context)();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('\x1b[31m●\x1b[0m ac / livingRoom / 1'));
  });
});

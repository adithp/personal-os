import { describe, expect, it } from 'vitest';
import { APP_NAME, APP_TIMEZONE } from './index';

describe('shared constants', () => {
  it('has the app name', () => {
    expect(APP_NAME).toBe('Personal OS');
  });

  it('uses a valid IANA display time zone', () => {
    expect(APP_TIMEZONE).toBe('Asia/Kolkata');
    expect(() => new Intl.DateTimeFormat('en-IN', { timeZone: APP_TIMEZONE })).not.toThrow();
  });
});

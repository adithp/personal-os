import { APP_NAME, APP_TIMEZONE } from '@personal-os/shared';
import { describe, expect, it } from 'vitest';

describe('workspace link to @personal-os/shared', () => {
  it('imports shared constants', () => {
    expect(APP_NAME).toBe('Personal OS');
    expect(APP_TIMEZONE).toBe('Asia/Kolkata');
  });
});

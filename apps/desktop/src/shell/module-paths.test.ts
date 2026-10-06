import { MODULE_IDS } from '@personal-os/shared';
import { describe, expect, it } from 'vitest';
import { moduleFromPath, modulePath } from './module-paths';

describe('module paths', () => {
  it('maps the dashboard to / and every other module to /<id>', () => {
    expect(modulePath('dashboard')).toBe('/');
    expect(modulePath('tasks')).toBe('/tasks');
    expect(modulePath('money')).toBe('/money');
  });

  it('round-trips every module', () => {
    for (const id of MODULE_IDS) {
      expect(moduleFromPath(modulePath(id))).toBe(id);
    }
  });

  it('finds the module for nested paths and ignores unknown ones', () => {
    expect(moduleFromPath('/tasks/123')).toBe('tasks');
    expect(moduleFromPath('/login')).toBeUndefined();
    expect(moduleFromPath('/nope')).toBeUndefined();
  });
});

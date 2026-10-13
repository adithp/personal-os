import { TAG_PALETTE } from '@personal-os/shared';
import { describe, expect, it } from 'vitest';
import { colorName, gridTarget } from './swatches';
import { mergeQuestion } from './tag-wording';

describe('mergeQuestion', () => {
  it('says how many tasks and favorites move, in singular and plural', () => {
    expect(mergeQuestion('home', 'house', 1)).toBe(
      "'home' already exists. Merge 'house' into it? 1 task will move to 'home'.",
    );
    expect(mergeQuestion('home', 'house', 5, 2)).toBe(
      "'home' already exists. Merge 'house' into it? 5 tasks and 2 favorites will move to 'home'.",
    );
    expect(mergeQuestion('home', 'house', 0, 1)).toContain('1 favorite will move to');
    expect(mergeQuestion('home', 'house', 0, 0)).toContain('No tasks use it.');
  });
});

describe('swatches', () => {
  it('names every palette color, ignoring case', () => {
    for (const color of TAG_PALETTE) {
      expect(colorName(color)).not.toBe('Custom');
      expect(colorName(color.toUpperCase())).toBe(colorName(color));
    }
    expect(colorName('#123456')).toBe('Custom');
  });

  it('moves by one, by a row, to the ends, and stays inside the grid', () => {
    expect(gridTarget('ArrowRight', 0, 5, 10)).toBe(1);
    expect(gridTarget('ArrowDown', 1, 5, 10)).toBe(6);
    expect(gridTarget('ArrowUp', 6, 5, 10)).toBe(1);
    expect(gridTarget('Home', 7, 5, 10)).toBe(0);
    expect(gridTarget('End', 2, 5, 10)).toBe(9);
    expect(gridTarget('ArrowLeft', 0, 5, 10)).toBeNull();
    expect(gridTarget('ArrowRight', 9, 5, 10)).toBeNull();
    expect(gridTarget('ArrowDown', 7, 5, 10)).toBeNull();
    expect(gridTarget('x', 3, 5, 10)).toBeNull();
  });
});

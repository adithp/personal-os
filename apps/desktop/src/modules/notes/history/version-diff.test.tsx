import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MAX_DIFF_ROWS, VersionDiff } from './version-diff';

const lines = (count: number, prefix = 'line') =>
  Array.from({ length: count }, (_, i) => `${prefix} ${String(i)}`).join('\n');

const diffOf = () => screen.getByRole('group', { name: /Changes compared/ });

describe('the version diff', () => {
  it('collapses a long run of unchanged lines and keeps two at each edge', () => {
    const same = lines(20);
    render(<VersionDiff current={`${same}\nmine`} version={`${same}\ntheirs`} />);
    expect(screen.getByText('… 16 unchanged lines')).toBeInTheDocument();
    expect(diffOf().querySelectorAll('[data-diff="same"]')).toHaveLength(4);
    expect(diffOf().querySelectorAll('[data-diff="add"]')).toHaveLength(1);
    expect(diffOf().querySelectorAll('[data-diff="remove"]')).toHaveLength(1);
  });

  it('leaves a short run of unchanged lines alone', () => {
    const same = lines(6);
    render(<VersionDiff current={`${same}\nmine`} version={`${same}\ntheirs`} />);
    expect(screen.queryByText(/unchanged lines/)).toBeNull();
    expect(diffOf().querySelectorAll('[data-diff="same"]')).toHaveLength(6);
  });

  it('draws at most 2000 rows and counts the rest', () => {
    render(<VersionDiff current="" version={lines(MAX_DIFF_ROWS + 500)} />);
    expect(diffOf().querySelectorAll('[data-diff]')).toHaveLength(MAX_DIFF_ROWS);
    expect(screen.getByText('500 more lines not shown')).toBeInTheDocument();
  });
});

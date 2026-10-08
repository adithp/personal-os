import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from './segmented-control';
import { Slider } from './slider';
import { Switch } from './switch';

const THEMES = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
] as const;

function Harness({ initial = 'system' as 'dark' | 'light' | 'system', onChange = vi.fn() }) {
  const [value, setValue] = useState(initial);
  return (
    <SegmentedControl
      label="Theme"
      value={value}
      options={THEMES}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe('SegmentedControl', () => {
  it('is a labelled radio group showing the chosen option', () => {
    render(<Harness initial="light" />);
    const group = screen.getByRole('radiogroup', { name: 'Theme' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Dark' })).not.toBeChecked();
  });

  it('marks the chosen option with the accent color', () => {
    render(<Harness initial="dark" />);
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveClass('bg-accent', 'text-on-tile');
    expect(screen.getByRole('radio', { name: 'Light' })).not.toHaveClass('bg-accent');
  });

  it('changes the choice on click', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(onChange).toHaveBeenCalledWith('dark');
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
  });

  it('keeps only the chosen option in the Tab order', () => {
    render(<Harness initial="light" />);
    expect(screen.getByRole('radio', { name: 'Light' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('tabindex', '-1');
  });

  it('moves with the arrow keys and wraps around', async () => {
    const onChange = vi.fn();
    render(<Harness initial="system" onChange={onChange} />);
    await userEvent.tab();
    expect(screen.getByRole('radio', { name: 'System' })).toHaveFocus();

    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('dark');
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveFocus();

    await userEvent.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenLastCalledWith('system');
    await userEvent.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenLastCalledWith('light');
  });
});

describe('Switch', () => {
  it('shows its state and toggles on click', async () => {
    const onCheckedChange = vi.fn();
    const { rerender } = render(
      <Switch checked={false} onCheckedChange={onCheckedChange} aria-label="Auto-hide" />,
    );
    const toggle = screen.getByRole('switch', { name: 'Auto-hide' });
    expect(toggle).not.toBeChecked();

    await userEvent.click(toggle);
    expect(onCheckedChange).toHaveBeenCalledWith(true);

    rerender(<Switch checked onCheckedChange={onCheckedChange} aria-label="Auto-hide" />);
    expect(screen.getByRole('switch', { name: 'Auto-hide' })).toBeChecked();
    expect(screen.getByRole('switch')).toHaveClass('bg-accent');
    await userEvent.click(screen.getByRole('switch'));
    expect(onCheckedChange).toHaveBeenLastCalledWith(false);
  });

  it('toggles with the keyboard', async () => {
    const onCheckedChange = vi.fn();
    render(<Switch checked={false} onCheckedChange={onCheckedChange} aria-label="Magnification" />);
    await userEvent.tab();
    await userEvent.keyboard(' ');
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('does nothing when disabled', async () => {
    const onCheckedChange = vi.fn();
    render(<Switch checked={false} disabled onCheckedChange={onCheckedChange} aria-label="X" />);
    await userEvent.click(screen.getByRole('switch'));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it('can be named by a visible label', () => {
    render(
      <>
        <span id="lbl">Auto-hide dock</span>
        <Switch checked onCheckedChange={() => undefined} aria-labelledby="lbl" />
      </>,
    );
    expect(screen.getByRole('switch', { name: 'Auto-hide dock' })).toBeInTheDocument();
  });
});

describe('Slider', () => {
  it('shows the value and range', () => {
    render(
      <Slider value={24} min={0} max={40} onValueChange={() => undefined} aria-label="Blur" />,
    );
    const slider = screen.getByRole('slider', { name: 'Blur' });
    expect(slider).toHaveValue('24');
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '40');
  });

  it('reports the new value as a number', () => {
    const onValueChange = vi.fn();
    render(<Slider value={24} min={0} max={40} onValueChange={onValueChange} aria-label="Blur" />);
    fireEvent.change(screen.getByRole('slider'), { target: { value: '31' } });
    expect(onValueChange).toHaveBeenCalledWith(31);
  });

  it('can be reached with the Tab key', async () => {
    render(
      <Slider value={24} min={0} max={40} onValueChange={() => undefined} aria-label="Blur" />,
    );
    await userEvent.tab();
    expect(screen.getByRole('slider')).toHaveFocus();
  });

  it('is disabled when asked', () => {
    render(
      <Slider value={5} min={0} max={10} disabled onValueChange={() => undefined} aria-label="X" />,
    );
    expect(screen.getByRole('slider')).toBeDisabled();
  });
});

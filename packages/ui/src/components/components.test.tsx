import { IconSearch } from '@tabler/icons-react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ActivityItem } from './activity-item';
import { ModuleAvatar } from './avatar';
import { Button, IconButton } from './button';
import { GlassCard } from './glass-card';
import { Input } from './input';
import { Kbd } from './kbd';
import { clampPercent } from '../lib/percent';
import { ProgressBar } from './progress-bar';
import { Tile } from './tile';
import { Tooltip } from './tooltip';

describe('Tile', () => {
  it('shows title, value, unit, and bottom lines on the module color', () => {
    render(
      <Tile
        module="tasks"
        title="Today's tasks"
        value="3"
        unit="of 7 done"
        lines={['Next: Submit assignment', 'Due 5:00 PM']}
      />,
    );
    const tile = screen.getByRole('region', { name: "Today's tasks" });
    expect(tile).toHaveStyle({ backgroundColor: 'var(--module-tasks)' });
    expect(tile).toHaveClass('text-on-tile');
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('of 7 done')).toBeInTheDocument();
    expect(screen.getByText('Next: Submit assignment')).toBeInTheDocument();
    expect(screen.getByText('Due 5:00 PM')).toBeInTheDocument();
  });

  it('opens the module from the corner button', async () => {
    const onOpen = vi.fn();
    render(<Tile module="calendar" title="Next event" value="3:00" onOpen={onOpen} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open Calendar' }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('has no corner button without onOpen and no progress bar without progress', () => {
    render(<Tile module="notes" title="Recent notes" value="0" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('shows a progress bar when progress is given', () => {
    render(<Tile module="money" title="Money" value="₹12,450" progress={62} />);
    expect(screen.getByRole('progressbar', { name: 'Money progress' })).toHaveAttribute(
      'aria-valuenow',
      '62',
    );
  });
});

describe('Tile compact', () => {
  it('uses tighter padding and a 28 px number but keeps the same content', () => {
    render(
      <Tile compact module="money" title="Money" value="₹12,450" unit="spent" lines={['62%']} />,
    );
    const el = screen.getByRole('region', { name: 'Money' });
    expect(el).toHaveClass('p-3', 'gap-2');
    expect(el).not.toHaveClass('p-4');
    expect(screen.getByText('₹12,450')).toHaveClass('text-[28px]');
    expect(screen.getByText('62%')).toBeInTheDocument();
    expect(el).toHaveStyle({ backgroundColor: 'var(--module-money)' });
  });

  it('is not compact by default', () => {
    render(<Tile module="money" title="Money" value="1" />);
    expect(screen.getByRole('region', { name: 'Money' })).toHaveClass('p-4', 'gap-3');
    expect(screen.getByText('1')).toHaveClass('text-big');
  });
});

describe('ProgressBar', () => {
  it.each([
    [-10, 0],
    [0, 0],
    [42.4, 42.4],
    [100, 100],
    [150, 100],
    [Number.NaN, 0],
  ])('clamps %s to %s', (input, expected) => {
    expect(clampPercent(input)).toBe(expected);
  });

  it('sets the fill width and aria values', () => {
    render(<ProgressBar value={130} label="Budget" />);
    const bar = screen.getByRole('progressbar', { name: 'Budget' });
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(bar.firstElementChild).toHaveStyle({ width: '100%' });
  });
});

describe('Button and IconButton', () => {
  it('renders a primary button by default with type="button"', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveClass('bg-accent', 'text-on-tile');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('renders the secondary glass variant', () => {
    render(<Button variant="secondary">Cancel</Button>);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveClass('glass', 'text-fg');
  });

  it('does not fire when disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('gives icon buttons an accessible name', () => {
    render(<IconButton aria-label="Search" icon={<IconSearch />} />);
    expect(screen.getByRole('button', { name: 'Search' })).toHaveClass('size-[30px]', 'glass');
  });
});

describe('Input', () => {
  it('accepts typing and shows the placeholder', async () => {
    render(<Input aria-label="Ask" placeholder="Ask or tell me what to do" />);
    const input = screen.getByRole('textbox', { name: 'Ask' });
    expect(input).toHaveAttribute('placeholder', 'Ask or tell me what to do');
    await userEvent.type(input, 'hello');
    expect(input).toHaveValue('hello');
  });
});

describe('GlassCard', () => {
  it('uses the glass surface and card radius', () => {
    render(<GlassCard data-testid="card">Content</GlassCard>);
    expect(screen.getByTestId('card')).toHaveClass('glass', 'rounded-card', 'p-4');
  });

  it('supports compact padding', () => {
    render(
      <GlassCard data-testid="card" padding="compact">
        Content
      </GlassCard>,
    );
    expect(screen.getByTestId('card')).toHaveClass('p-3');
  });
});

describe('ActivityItem and ModuleAvatar', () => {
  it('shows the title, description, and a module-colored avatar', () => {
    const { container } = render(
      <ActivityItem module="mail" title="New email" description="Website feedback" />,
    );
    expect(screen.getByRole('heading', { name: 'New email' })).toBeInTheDocument();
    expect(screen.getByText('Website feedback')).toBeInTheDocument();
    const avatar = container.querySelector('[data-module="mail"]');
    expect(avatar).toHaveStyle({ backgroundColor: 'var(--module-mail)' });
  });

  it('renders a 26 px round avatar', () => {
    const { container } = render(<ModuleAvatar module="money" />);
    expect(container.firstElementChild).toHaveClass('size-[26px]', 'rounded-full');
  });
});

describe('Kbd', () => {
  it('renders each key', () => {
    render(<Kbd keys={['Ctrl', 'K']} />);
    expect(screen.getByLabelText('Ctrl K')).toBeInTheDocument();
    expect(screen.getByText('Ctrl').tagName).toBe('KBD');
    expect(screen.getByText('K').tagName).toBe('KBD');
  });
});

describe('Tooltip', () => {
  it('shows on hover and hides on leave', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip label="Tasks">
        <button type="button">T</button>
      </Tooltip>,
    );
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    await user.hover(screen.getByRole('button'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Tasks');
    expect(screen.getByRole('button')).toHaveAccessibleDescription('Tasks');

    await user.unhover(screen.getByRole('button'));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shows on keyboard focus and hides on Escape', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip label="Settings">
        <button type="button">S</button>
      </Tooltip>,
    );
    await user.tab();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Settings');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});

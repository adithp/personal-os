import { MODULE_IDS, MODULES } from '@personal-os/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Dock, type DockProps } from './dock';

function renderDock(props: Partial<DockProps> = {}) {
  const onNavigate = vi.fn();
  render(
    <Dock
      activeModule="dashboard"
      onNavigate={onNavigate}
      iconSize="medium"
      magnification
      autoHide={false}
      {...props}
    />,
  );
  return { onNavigate };
}

describe('Dock', () => {
  it('shows every module in the DESIGN.md order', () => {
    renderDock();
    const names = within(screen.getByRole('navigation', { name: 'Modules' }))
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'));
    expect(names).toEqual(MODULE_IDS.map((id) => MODULES[id].name));
    expect(names.at(0)).toBe('Dashboard');
    expect(names.at(-1)).toBe('Settings');
  });

  it('puts the divider between Money and the AI assistant', () => {
    renderDock();
    const divider = screen.getByTestId('dock-divider');
    expect(divider.parentElement?.querySelector('button')).toHaveAttribute('aria-label', 'Money');
    expect(divider.parentElement?.nextElementSibling?.querySelector('button')).toHaveAttribute(
      'aria-label',
      'AI assistant',
    );
  });

  it('colors each icon with its module color', () => {
    renderDock();
    expect(screen.getByRole('button', { name: 'Tasks' })).toHaveStyle({
      backgroundColor: 'var(--module-tasks)',
    });
    expect(screen.getByRole('button', { name: 'Money' })).toHaveStyle({
      backgroundColor: 'var(--module-money)',
    });
  });

  it('marks only the active module with a dot', () => {
    renderDock({ activeModule: 'notes' });
    expect(screen.getAllByTestId('active-dot')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Notes' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Tasks' })).not.toHaveAttribute('aria-current');
  });

  it('shows no dot on an unknown page', () => {
    renderDock({ activeModule: undefined });
    expect(screen.queryByTestId('active-dot')).not.toBeInTheDocument();
  });

  it('opens a module when its icon is clicked', async () => {
    const { onNavigate } = renderDock();
    await userEvent.click(screen.getByRole('button', { name: 'Calendar' }));
    expect(onNavigate).toHaveBeenCalledWith('calendar');
  });

  it('shows the module name in a tooltip on hover', async () => {
    renderDock();
    await userEvent.hover(screen.getByRole('button', { name: 'Habits' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Habits');
  });

  it.each([
    ['small', '32px'],
    ['medium', '36px'],
    ['large', '44px'],
  ] as const)('uses %s icons (%s)', (iconSize, px) => {
    renderDock({ iconSize });
    expect(screen.getByRole('button', { name: 'Tasks' })).toHaveStyle({ width: px, height: px });
  });

  it('is 60 px tall, taller only for large icons', () => {
    renderDock({ iconSize: 'medium' });
    expect(screen.getByRole('navigation').firstElementChild).toHaveStyle({ height: '60px' });
  });

  it('is reachable with the keyboard', async () => {
    const { onNavigate } = renderDock();
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    expect(onNavigate).toHaveBeenCalledWith('dashboard');
  });
});

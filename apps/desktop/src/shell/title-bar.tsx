import { APP_NAME } from '@personal-os/shared';
import { cx } from '@personal-os/ui';
import { IconMinus, IconSquare, IconSquares, IconX } from '@tabler/icons-react';
import type { ComponentProps } from 'react';

export interface TitleBarProps {
  maximized: boolean;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onClose: () => void;
}

function WindowButton({ className, ...props }: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cx(
        'flex h-7 w-9 items-center justify-center rounded-[8px] liquid-hover text-fg-secondary focus-ring transition-colors duration-150 ease-out hover:text-fg',
        className,
      )}
      {...props}
    />
  );
}

/** Glass title bar for the frameless window: drag region, app name, window buttons. */
export function TitleBar({ maximized, onMinimize, onToggleMaximize, onClose }: TitleBarProps) {
  return (
    <header
      data-tauri-drag-region
      className="fixed inset-x-0 top-0 z-30 flex h-10 items-center justify-between"
    >
      <span data-tauri-drag-region className="flex-1 pl-4 text-[11px] text-fg-muted">
        {APP_NAME}
      </span>
      <div className="flex items-center gap-1 pr-2">
        <WindowButton aria-label="Minimize" onClick={onMinimize}>
          <IconMinus size={16} stroke={1.75} aria-hidden />
        </WindowButton>
        <WindowButton aria-label={maximized ? 'Restore' : 'Maximize'} onClick={onToggleMaximize}>
          {maximized ? (
            <IconSquares size={14} stroke={1.75} aria-hidden />
          ) : (
            <IconSquare size={14} stroke={1.75} aria-hidden />
          )}
        </WindowButton>
        <WindowButton
          aria-label="Close"
          onClick={onClose}
          className="hover:bg-window-close! hover:text-white"
        >
          <IconX size={16} stroke={1.75} aria-hidden />
        </WindowButton>
      </div>
    </header>
  );
}

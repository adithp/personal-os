import { Tooltip } from '@personal-os/ui';
import { IconLayoutSidebarRight, IconLayoutSidebarRightCollapse } from '@tabler/icons-react';
import { useNotesUi } from '../notes-ui-store';

/** The editor top bar button that shows or hides the right panel (links and outline). */
export function RightPanelToggle() {
  const open = useNotesUi((state) => state.rightPanelOpen);
  const toggle = useNotesUi((state) => state.toggleRightPanel);
  const label = open ? 'Hide links and outline' : 'Show links and outline';
  const Glyph = open ? IconLayoutSidebarRightCollapse : IconLayoutSidebarRight;

  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={open}
        onClick={toggle}
        className="flex size-7 items-center justify-center rounded-chip text-fg-muted focus-ring hover:bg-tint hover:text-fg"
      >
        <Glyph size={16} stroke={1.5} aria-hidden />
      </button>
    </Tooltip>
  );
}

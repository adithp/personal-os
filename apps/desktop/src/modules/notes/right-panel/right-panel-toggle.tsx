import { Tooltip } from '@personal-os/ui';
import { IconLayoutSidebarRight, IconLayoutSidebarRightCollapse } from '@tabler/icons-react';
import { useNotesUi } from '../notes-ui-store';

const LABEL = 'Links and outline';

/**
 * The editor top bar button that shows or hides the right panel (links and outline). The label
 * stays the same; `aria-pressed` says whether the panel is open.
 */
export function RightPanelToggle() {
  const open = useNotesUi((state) => state.rightPanelOpen);
  const toggle = useNotesUi((state) => state.toggleRightPanel);
  const Glyph = open ? IconLayoutSidebarRightCollapse : IconLayoutSidebarRight;

  return (
    <Tooltip label={LABEL}>
      <button
        type="button"
        aria-label={LABEL}
        aria-pressed={open}
        data-right-panel-toggle
        onClick={toggle}
        className="flex size-7 items-center justify-center rounded-chip text-fg-muted focus-ring hover:bg-tint hover:text-fg"
      >
        <Glyph size={16} stroke={1.5} aria-hidden />
      </button>
    </Tooltip>
  );
}

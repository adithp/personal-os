import type { DockIconSize, ModuleId } from '@personal-os/shared';
import { DOCK_ICON_SIZES, MODULE_IDS, MODULES } from '@personal-os/shared';
import { MODULE_ICONS, Tooltip, moduleColorVar } from '@personal-os/ui';
import type { MotionValue } from 'motion/react';
import { motion, useMotionValue, useTransform } from 'motion/react';
import { useRef } from 'react';
import { dockHeight, magnifiedScale } from './dock-math';
import { useDockAutoHide } from './use-dock-auto-hide';

/** The divider sits after the last module, before the AI assistant and Settings. */
const DIVIDER_AFTER: ModuleId = 'money';

interface DockIconProps {
  id: ModuleId;
  size: number;
  magnification: boolean;
  mouseX: MotionValue<number>;
  active: boolean;
  onOpen: (id: ModuleId) => void;
}

function DockIcon({ id, size, magnification, mouseX, active, onOpen }: DockIconProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const Icon = MODULE_ICONS[id];

  // Size follows the cursor directly, with no spring, so there is no delay.
  const px = useTransform(mouseX, (x) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return size;
    return size * magnifiedScale(x - (box.left + box.width / 2), magnification);
  });

  return (
    <div className="relative flex shrink-0 justify-center">
      <Tooltip label={MODULES[id].name}>
        <motion.button
          ref={ref}
          type="button"
          aria-label={MODULES[id].name}
          aria-current={active ? 'page' : undefined}
          onClick={() => {
            onOpen(id);
          }}
          className="flex items-center justify-center rounded-dock-icon text-on-tile focus-ring"
          style={{ width: px, height: px, backgroundColor: moduleColorVar(id) }}
        >
          <Icon size="55%" stroke={1.75} aria-hidden />
        </motion.button>
      </Tooltip>
      {active && (
        <span
          data-testid="active-dot"
          aria-hidden
          className="absolute -bottom-2 size-1 rounded-full bg-fg"
        />
      )}
    </div>
  );
}

export interface DockProps {
  activeModule: ModuleId | undefined;
  onNavigate: (id: ModuleId) => void;
  iconSize: DockIconSize;
  magnification: boolean;
  autoHide: boolean;
}

/** Floating bottom dock: the only navigation in the app (docs/DESIGN.md section 7). */
export function Dock({ activeModule, onNavigate, iconSize, magnification, autoHide }: DockProps) {
  const size = DOCK_ICON_SIZES[iconSize];
  const height = dockHeight(size);
  const mouseX = useMotionValue(Number.POSITIVE_INFINITY);
  const { visible, dockHandlers } = useDockAutoHide(autoHide);

  return (
    <motion.nav
      aria-label="Modules"
      data-visible={visible}
      initial={false}
      animate={{ y: visible ? 0 : height + 20 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="fixed bottom-2.5 left-1/2 z-20 -translate-x-1/2"
      onMouseMove={(event) => {
        mouseX.set(event.clientX);
      }}
      onMouseEnter={dockHandlers.onMouseEnter}
      onMouseLeave={() => {
        mouseX.set(Number.POSITIVE_INFINITY);
        dockHandlers.onMouseLeave();
      }}
    >
      <div
        className="flex items-end gap-1.5 rounded-dock glass-strong px-2.5 pb-3"
        style={{ height }}
      >
        {MODULE_IDS.map((id) => (
          <div key={id} className="flex items-end gap-1.5">
            <DockIcon
              id={id}
              size={size}
              magnification={magnification}
              mouseX={mouseX}
              active={id === activeModule}
              onOpen={onNavigate}
            />
            {id === DIVIDER_AFTER && (
              <span
                data-testid="dock-divider"
                aria-hidden
                className="mx-1 h-7 w-px self-center bg-glass-border"
              />
            )}
          </div>
        ))}
      </div>
    </motion.nav>
  );
}

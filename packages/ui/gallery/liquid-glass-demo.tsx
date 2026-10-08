import type { GlassEffect } from '@personal-os/shared';
import { IconPlus, IconSearch, IconSend } from '@tabler/icons-react';
import {
  Button,
  GlassCard,
  IconButton,
  Input,
  MODULE_ICONS,
  SegmentedControl,
  Tile,
  moduleColorVar,
} from '../src';

const STAGE_BACKGROUND = [
  'radial-gradient(circle at 14% 24%, #ff7eb3 0 86px, transparent 87px)',
  'radial-gradient(circle at 86% 30%, #7afcff 0 70px, transparent 71px)',
  'radial-gradient(circle at 58% 88%, #feff9c 0 84px, transparent 85px)',
  'repeating-linear-gradient(45deg, rgb(255 255 255 / 0.2) 0 10px, transparent 10px 24px)',
  'linear-gradient(135deg, #5b5bd6 0%, #12c2e9 52%, #f64f59 100%)',
].join(', ');

const LABELS: Record<GlassEffect, { title: string; text: string }> = {
  liquid: { title: 'Liquid', text: 'Edges bend the background, with a bright rim and shine' },
  simple: { title: 'Simple', text: 'Blur only: the glass used before' },
  off: { title: 'Off', text: 'Solid panels, for low power' },
};

const DOCK_MODULES = ['tasks', 'notes', 'calendar', 'mail', 'money'] as const;

/** A busy backdrop with big text, so the bending of the edges can be seen. */
function Stage({ mode, children }: { mode: GlassEffect; children: React.ReactNode }) {
  return (
    <div
      data-glass={mode}
      data-testid={`stage-${mode}`}
      className="relative flex flex-col gap-4 overflow-hidden rounded-card p-5"
      style={{ background: STAGE_BACKGROUND }}
    >
      <p
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-0 overflow-hidden text-[40px] leading-[44px] font-black tracking-tight text-white/30 uppercase"
      >
        Refraction bends this text at the edges of the glass. Refraction bends this text.
      </p>
      <div className="relative z-10 flex flex-col gap-4">{children}</div>
    </div>
  );
}

function StageContents({ mode }: { mode: GlassEffect }) {
  const info = LABELS[mode];
  return (
    <>
      <div className="text-on-tile">
        <h3 className="text-section font-semibold text-white drop-shadow">{info.title}</h3>
        <p className="text-small text-white/90 drop-shadow">{info.text}</p>
      </div>

      <GlassCard className="flex flex-col gap-3">
        <p className="text-card font-semibold text-fg">Glass card</p>
        <p className="text-small text-fg-secondary">
          Cards, the command palette, and the assistant use this surface.
        </p>
        <div className="flex items-center gap-2">
          <IconSearch size={16} className="shrink-0 text-fg-muted" aria-hidden />
          <Input aria-label={`${info.title} sample input`} placeholder="Type here" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <IconButton aria-label="Add" icon={<IconPlus size={16} />} />
          <IconButton aria-label="Send" icon={<IconSend size={16} />} />
        </div>
        <SegmentedControl
          label={`${info.title} sample choice`}
          value="b"
          onChange={() => undefined}
          options={[
            { value: 'a', label: 'One' },
            { value: 'b', label: 'Two' },
            { value: 'c', label: 'Three' },
          ]}
        />
      </GlassCard>

      <Tile
        compact
        module="tasks"
        title="Pastel tile"
        value="3"
        unit="of 7 done"
        lines={['Keeps its solid color']}
        progress={43}
      />

      <div
        data-liquid-step="32"
        className="flex items-end justify-center gap-1.5 rounded-dock glass-strong px-2.5 py-2.5"
      >
        {DOCK_MODULES.map((id) => {
          const Icon = MODULE_ICONS[id];
          return (
            <span
              key={id}
              className="flex size-9 items-center justify-center rounded-dock-icon liquid-tile text-on-tile"
              style={{ backgroundColor: moduleColorVar(id) }}
            >
              <Icon size={20} stroke={1.75} aria-hidden />
            </span>
          );
        })}
      </div>
    </>
  );
}

/** The same screen drawn three ways side by side: Liquid, Simple, Off. */
export function LiquidGlassComparison() {
  const modes: GlassEffect[] = ['liquid', 'simple', 'off'];
  return (
    <div className="grid grid-cols-3 gap-4">
      {modes.map((mode) => (
        <Stage key={mode} mode={mode}>
          <StageContents mode={mode} />
        </Stage>
      ))}
    </div>
  );
}

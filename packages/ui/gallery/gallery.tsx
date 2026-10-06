import type { ThemeMode } from '@personal-os/shared';
import { MODULE_IDS, MODULES, THEME_MODES } from '@personal-os/shared';
import { IconPlus, IconSearch, IconSend, IconSparkles, IconTrash } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  ActivityItem,
  Button,
  GlassCard,
  IconButton,
  Input,
  Kbd,
  MODULE_ICONS,
  ModuleAvatar,
  SegmentedControl,
  Slider,
  Switch,
  Tile,
  Tooltip,
  cx,
  moduleColorVar,
  useApplyTheme,
} from '../src';

const THEME_LABELS: Record<ThemeMode, string> = { dark: 'Dark', light: 'Light', system: 'System' };

const TOKENS = [
  ['bg', '--bg'],
  ['glass', '--glass'],
  ['glass-border', '--glass-border'],
  ['glass-strong', '--glass-strong'],
  ['text-primary', '--text-primary'],
  ['text-secondary', '--text-secondary'],
  ['text-muted', '--text-muted'],
  ['text-on-tile', '--text-on-tile'],
  ['danger', '--danger'],
  ['accent', '--accent'],
] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-section font-semibold text-fg">{title}</h2>
      {children}
    </section>
  );
}

function ControlsDemo() {
  const [background, setBackground] = useState<'transparent' | 'wallpaper' | 'solid'>(
    'transparent',
  );
  const [autoHide, setAutoHide] = useState(false);
  const [blur, setBlur] = useState(24);
  return (
    <GlassCard className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <span className="text-body text-fg">Segmented control</span>
        <SegmentedControl
          label="Background"
          value={background}
          onChange={setBackground}
          options={[
            { value: 'transparent', label: 'Transparent' },
            { value: 'wallpaper', label: 'Wallpaper' },
            { value: 'solid', label: 'Solid' },
          ]}
        />
      </div>
      <div className="flex items-center justify-between gap-4">
        <span id="demo-switch" className="text-body text-fg">
          Switch
        </span>
        <Switch checked={autoHide} onCheckedChange={setAutoHide} aria-labelledby="demo-switch" />
      </div>
      <div className="flex items-center justify-between gap-4">
        <span id="demo-slider" className="text-body text-fg">
          Slider
        </span>
        <div className="flex items-center gap-3">
          <Slider
            value={blur}
            min={0}
            max={40}
            onValueChange={setBlur}
            aria-labelledby="demo-slider"
          />
          <span className="w-10 text-small text-fg-muted tabular-nums">{blur} px</span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-body text-fg">Disabled</span>
        <Switch
          checked={false}
          disabled
          onCheckedChange={() => undefined}
          aria-label="Disabled switch"
        />
      </div>
    </GlassCard>
  );
}

export function Gallery() {
  const [mode, setMode] = useState<ThemeMode>('system');
  const [wallpaper, setWallpaper] = useState(true);
  const [blur, setBlur] = useState(24);
  const [opened, setOpened] = useState<string | null>(null);
  const theme = useApplyTheme(mode);

  return (
    <div className="min-h-screen" style={{ ['--glass-blur' as string]: `${String(blur)}px` }}>
      {wallpaper && (
        <div
          aria-hidden
          className="fixed inset-0 -z-10"
          style={{ background: 'var(--wallpaper-default)' }}
        />
      )}

      <main className="mx-auto flex max-w-[1100px] flex-col gap-8 px-8 pt-8 pb-20">
        {/* Controls */}
        <GlassCard className="flex flex-wrap items-center gap-6">
          <div>
            <h1 className="text-page font-semibold text-fg">UI gallery</h1>
            <p className="text-small text-fg-muted">packages/ui · showing {theme} theme</p>
          </div>

          <div role="radiogroup" aria-label="Theme" className="flex gap-1">
            {THEME_MODES.map((m) => (
              <Button
                key={m}
                role="radio"
                aria-checked={mode === m}
                variant={mode === m ? 'primary' : 'secondary'}
                onClick={() => {
                  setMode(m);
                }}
              >
                {THEME_LABELS[m]}
              </Button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-body text-fg">
            <input
              type="checkbox"
              checked={wallpaper}
              onChange={(e) => {
                setWallpaper(e.target.checked);
              }}
              className="accent-accent"
            />
            Wallpaper
          </label>

          <label className="flex items-center gap-2 text-body text-fg">
            Blur
            <input
              type="range"
              min={0}
              max={40}
              value={blur}
              onChange={(e) => {
                setBlur(Number(e.target.value));
              }}
              className="accent-accent"
            />
            <span className="w-10 text-fg-muted tabular-nums">{blur} px</span>
          </label>
        </GlassCard>

        <Section title="Theme tokens">
          <div className="grid grid-cols-5 gap-3">
            {TOKENS.map(([name, cssVar]) => (
              <GlassCard key={name} padding="compact" className="flex flex-col gap-2">
                <div
                  className="h-10 rounded-[8px] border-[0.5px] border-glass-border"
                  style={{ background: `var(${cssVar})` }}
                />
                <span className="text-small text-fg-secondary">{name}</span>
              </GlassCard>
            ))}
          </div>
        </Section>

        <Section title="Module colors">
          <div className="grid grid-cols-6 gap-3">
            {MODULE_IDS.map((id) => {
              const Icon = MODULE_ICONS[id];
              return (
                <div
                  key={id}
                  className="flex flex-col gap-2 rounded-tile p-3 text-on-tile"
                  style={{ backgroundColor: moduleColorVar(id) }}
                >
                  <Icon size={20} stroke={1.75} aria-hidden />
                  <span className="text-card font-medium">{MODULES[id].name}</span>
                  <span className="text-small">{MODULES[id].color}</span>
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="Typography">
          <GlassCard className="flex flex-col gap-2 text-fg">
            <span className="text-page font-semibold">Page title 22 · Good morning</span>
            <span className="text-section font-semibold">Section title 16</span>
            <span className="text-card font-medium">Card title 13</span>
            <span className="text-body">
              Body 13 · The quick brown fox jumps over the lazy dog.
            </span>
            <span className="text-small text-fg-secondary">Small 11 · secondary text</span>
            <span className="text-small text-fg-muted">Small 11 · muted text</span>
            <span className="text-big font-semibold">₹12,450</span>
            <span className="text-body text-danger">Danger text</span>
          </GlassCard>
        </Section>

        <Section title="Buttons">
          <GlassCard className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button disabled>Primary disabled</Button>
            <Button variant="secondary" disabled>
              Secondary disabled
            </Button>
            <Button>
              <IconPlus size={16} aria-hidden /> New task
            </Button>
            <IconButton aria-label="Search" icon={<IconSearch size={16} />} />
            <IconButton aria-label="Delete" icon={<IconTrash size={16} />} disabled />
          </GlassCard>
        </Section>

        <Section title="Inputs">
          <GlassCard className="grid grid-cols-3 gap-3">
            <Input placeholder="Ask or tell me what to do" aria-label="Example input" />
            <Input defaultValue="Filled value" aria-label="Filled input" />
            <Input placeholder="Disabled" disabled aria-label="Disabled input" />
            <Input placeholder="Invalid" aria-invalid aria-label="Invalid input" />
          </GlassCard>
        </Section>

        <Section title="Glass card">
          <GlassCard className="flex items-center gap-3">
            <IconSparkles size={20} className="shrink-0 text-accent" aria-hidden />
            <p className="flex-1 text-body text-fg-secondary">
              You have 4 tasks due today and a client call at 3:00 PM.
            </p>
            <Input
              placeholder="Ask or tell me what to do"
              aria-label="Assistant"
              className="max-w-xs"
            />
            <IconButton
              aria-label="Send"
              icon={<IconSend size={16} />}
              className="border-transparent bg-accent text-on-tile"
            />
          </GlassCard>
        </Section>

        <Section title="Tiles">
          {opened && (
            <p className="text-small text-fg-secondary" role="status">
              Open button clicked: {opened}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Tile
              module="tasks"
              title="Today's tasks"
              value="3"
              unit="of 7 done"
              lines={['Next: Submit DBMS assignment · 5:00 PM']}
              progress={43}
              onOpen={() => {
                setOpened('Tasks');
              }}
            />
            <Tile
              module="calendar"
              title="Next event"
              value="3:00"
              unit="PM"
              lines={['Client call – website project', 'in 45 minutes']}
              onOpen={() => {
                setOpened('Calendar');
              }}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Tile
              module="money"
              title="Money"
              value="₹12,450"
              unit="spent"
              lines={['62% of ₹20,000 budget']}
              progress={62}
              onOpen={() => {
                setOpened('Money');
              }}
            />
            <Tile
              module="habits"
              title="Streak"
              value="12"
              unit="days"
              lines={['Morning workout']}
              onOpen={() => {
                setOpened('Habits');
              }}
            />
            <Tile
              module="projects"
              title="Projects"
              value="4"
              unit="active"
              lines={['Website redesign · 70%', 'Mobile app · 35%']}
              onOpen={() => {
                setOpened('Projects');
              }}
            />
          </div>
          <h3 className="text-card text-fg-secondary">Edge cases</h3>
          <div className="grid grid-cols-4 gap-3">
            <Tile module="notes" title="No action button" value="0" unit="notes" />
            <Tile module="mail" title="Progress 0%" value="0" unit="replied" progress={0} />
            <Tile module="assistant" title="Progress 100%" value="5" unit="of 5" progress={100} />
            <Tile
              module="drive"
              title="A very long tile title that should not break the layout"
              value="1,234,567"
              unit="files"
              lines={['A very long bottom line that keeps going and going until it is cut off']}
            />
          </div>
        </Section>

        <Section title="Activity items and avatars">
          <div className="grid grid-cols-[240px_1fr] gap-6">
            <div className="flex flex-col gap-2">
              <ActivityItem
                module="mail"
                title="New email from Rahul"
                description="Website feedback and next steps"
              />
              <ActivityItem
                module="tasks"
                title="Task completed"
                description="Submit DBMS assignment"
              />
              <ActivityItem module="money" title="Expense logged" description="₹450 · Food · UPI" />
              <ActivityItem
                module="notes"
                title="A very long activity title that should be truncated"
                description="And a very long description line that is also truncated at the edge"
              />
            </div>
            <div className="flex flex-wrap content-start gap-2">
              {MODULE_IDS.map((id) => (
                <ModuleAvatar key={id} module={id} />
              ))}
            </div>
          </div>
        </Section>

        <Section title="Controls">
          <ControlsDemo />
        </Section>

        <Section title="Keyboard hint and tooltip">
          <GlassCard className="flex flex-wrap items-center gap-6">
            <div className={cx('flex h-[34px] w-72 items-center gap-2 rounded-control glass px-3')}>
              <IconSearch size={16} className="text-fg-muted" aria-hidden />
              <span className="flex-1 text-body text-fg-muted">Search</span>
              <Kbd keys={['Ctrl', 'K']} />
            </div>
            <Tooltip label="Tasks">
              <button
                type="button"
                className="flex size-9 items-center justify-center rounded-dock-icon text-on-tile focus-ring"
                style={{ backgroundColor: moduleColorVar('tasks') }}
                aria-label="Tasks"
              >
                <MODULE_ICONS.tasks size={20} stroke={1.75} aria-hidden />
              </button>
            </Tooltip>
            <span className="text-small text-fg-muted">Hover or Tab to the yellow icon</span>
          </GlassCard>
        </Section>
      </main>
    </div>
  );
}

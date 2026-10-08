import type { ModuleId } from '@personal-os/shared';
import { Input, Kbd, Tile } from '@personal-os/ui';
import { IconSearch } from '@tabler/icons-react';
import { useNavigate } from '@tanstack/react-router';
import { modulePath } from '../../shell/module-paths';
import { usePalette } from '../../store/palette-store';
import { ActivityCard } from './activity-card';
import { AssistantCard } from './assistant-card';
import { addDays, todayInIndia } from './calendar-grid';
import { DASHBOARD_DATA, moneyTileText } from './dashboard-data';
import { formatDashboardDate, greetingFor, useNow } from './greeting';
import { MiniCalendar } from './mini-calendar';
import { QuickActions } from './quick-actions';
import { UpcomingCard } from './upcoming-card';
import { useTasksTile } from './use-tasks-tile';

/**
 * The day at a glance (real tasks in the Today's tasks tile, static placeholder data elsewhere).
 * Two columns that scroll independently when the window is short: the main column
 * (greeting, assistant, tiles, quick actions) and the right column (calendar, upcoming, activity).
 */
export function DashboardPage() {
  const navigate = useNavigate();
  const now = useNow();
  const { emails, streak, projects } = DASHBOARD_DATA;
  const tasks = useTasksTile(now).text;
  const money = moneyTileText();

  const today = todayInIndia(now);
  const eventDays = DASHBOARD_DATA.eventDayOffsets.map((offset) => addDays(today, offset));

  const open = (id: ModuleId) => () => {
    void navigate({ to: modulePath(id) });
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-[1200px] gap-6 px-8 pt-4">
      <div
        data-testid="main-column"
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto pb-4"
      >
        <header>
          <h1 className="text-page font-semibold text-fg">{greetingFor(now)}</h1>
          <p className="text-small text-fg-muted">{formatDashboardDate(now)}</p>
        </header>

        <div className="relative">
          <Input
            type="search"
            aria-label="Search"
            placeholder="Search or type a command"
            autoComplete="off"
            value=""
            className="h-10 pr-20 pl-9"
            onClick={() => {
              usePalette.getState().setOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') usePalette.getState().setOpen(true);
            }}
            onChange={(event) => {
              // Typing here opens the palette with the text, and the field itself stays empty.
              // Fast typing can add letters before focus has moved, so they are appended.
              const { open, query, openWith, setQuery } = usePalette.getState();
              if (open) setQuery(query + event.target.value);
              else openWith(event.target.value);
            }}
          />
          <IconSearch
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2 text-fg-muted"
            aria-hidden
          />
          <Kbd
            keys={['Ctrl', 'K']}
            className="pointer-events-none absolute top-1/2 right-3 z-10 -translate-y-1/2"
          />
        </div>

        <AssistantCard summary={DASHBOARD_DATA.summary} />

        {/* Five tiles and the quick actions card, all the same size */}
        <div className="grid auto-rows-fr grid-cols-3 gap-3">
          <Tile
            module="tasks"
            title="Today's tasks"
            value={tasks.value}
            unit={tasks.unit}
            lines={tasks.lines}
            progress={tasks.progress}
            onOpen={open('tasks')}
          />
          <Tile
            module="mail"
            title="Important emails"
            value={emails.needReply}
            unit="need a reply"
            lines={[emails.topSubjects[0], emails.topSubjects[1]]}
            onOpen={open('mail')}
          />
          <Tile
            module="money"
            title="Money"
            value={money.spent}
            unit="spent"
            lines={[money.line]}
            progress={money.percent}
            onOpen={open('money')}
          />
          <Tile
            module="habits"
            title="Streak"
            value={streak.days}
            unit="days"
            lines={[streak.habit]}
            onOpen={open('habits')}
          />
          <Tile
            module="projects"
            title="Projects"
            value={projects.active}
            unit="active"
            lines={[
              `${projects.top[0].name} · ${String(projects.top[0].progress)}%`,
              `${projects.top[1].name} · ${String(projects.top[1].progress)}%`,
            ]}
            onOpen={open('projects')}
          />
          <QuickActions />
        </div>
      </div>

      <aside
        aria-label="Calendar, upcoming events, and activity"
        data-testid="right-column"
        className="flex min-h-0 w-[280px] shrink-0 flex-col gap-3 overflow-y-auto pb-4"
      >
        <MiniCalendar now={now} eventDays={eventDays} />
        <UpcomingCard events={DASHBOARD_DATA.upcoming} />
        <ActivityCard items={DASHBOARD_DATA.activity} />
      </aside>
    </div>
  );
}

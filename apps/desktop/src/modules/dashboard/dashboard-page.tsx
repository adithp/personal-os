import type { ModuleId } from '@personal-os/shared';
import { Kbd, Tile } from '@personal-os/ui';
import { IconSearch } from '@tabler/icons-react';
import { useNavigate } from '@tanstack/react-router';
import { modulePath } from '../../shell/module-paths';
import { ActivityCard } from './activity-card';
import { AssistantCard } from './assistant-card';
import { addDays, todayInIndia } from './calendar-grid';
import { DASHBOARD_DATA, moneyTileText, tasksProgressPercent } from './dashboard-data';
import { formatDashboardDate, greetingFor, useNow } from './greeting';
import { MiniCalendar } from './mini-calendar';
import { QuickActions } from './quick-actions';
import { UpcomingCard } from './upcoming-card';

/**
 * The day at a glance (static placeholder data for now).
 * Two columns that scroll independently when the window is short: the main column
 * (greeting, assistant, tiles, quick actions) and the right column (calendar, upcoming, activity).
 */
export function DashboardPage() {
  const navigate = useNavigate();
  const now = useNow();
  const { tasks, emails, streak, projects } = DASHBOARD_DATA;
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
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-page font-semibold text-fg">{greetingFor(now)}</h1>
            <p className="text-small text-fg-muted">{formatDashboardDate(now)}</p>
          </div>
          {/* Opens the command palette in feature (f) */}
          <button
            type="button"
            aria-label="Search"
            className="flex h-[34px] w-72 shrink-0 items-center gap-2 rounded-control glass px-3 text-body text-fg-muted focus-ring"
          >
            <IconSearch size={16} aria-hidden />
            <span className="flex-1 text-left">Search</span>
            <Kbd keys={['Ctrl', 'K']} />
          </button>
        </header>

        <AssistantCard summary={DASHBOARD_DATA.summary} />

        <div className="grid grid-cols-2 gap-3">
          <Tile
            compact
            module="tasks"
            title="Today's tasks"
            value={tasks.done}
            unit={`of ${String(tasks.total)} done`}
            lines={[`Next: ${tasks.nextTitle} · ${tasks.nextDue}`]}
            progress={tasksProgressPercent()}
            onOpen={open('tasks')}
          />
          <Tile
            compact
            module="mail"
            title="Important emails"
            value={emails.needReply}
            unit="need a reply"
            lines={[emails.topSubjects[0], emails.topSubjects[1]]}
            onOpen={open('mail')}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Tile
            compact
            module="money"
            title="Money"
            value={money.spent}
            unit="spent"
            lines={[money.line]}
            progress={money.percent}
            onOpen={open('money')}
          />
          <Tile
            compact
            module="habits"
            title="Streak"
            value={streak.days}
            unit="days"
            lines={[streak.habit]}
            onOpen={open('habits')}
          />
          <Tile
            compact
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
        </div>

        <QuickActions />
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

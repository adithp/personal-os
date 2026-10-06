import { APP_TIMEZONE } from '@personal-os/shared';
import { useEffect, useState } from 'react';

const hourFormat = new Intl.DateTimeFormat('en-IN', {
  timeZone: APP_TIMEZONE,
  hour: 'numeric',
  hourCycle: 'h23',
});

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  timeZone: APP_TIMEZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** Hour of the day (0–23) in Asia/Kolkata, whatever the computer's own time zone is. */
export function istHour(date: Date): number {
  return Number(hourFormat.format(date));
}

export type Greeting = 'Good morning' | 'Good afternoon' | 'Good evening';

/** Morning 05:00–11:59, afternoon 12:00–16:59, evening 17:00–04:59 (India time). */
export function greetingFor(date: Date): Greeting {
  const hour = istHour(date);
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** The date in India, e.g. "Tuesday, 7 October". */
export function formatDashboardDate(date: Date): string {
  const parts = Object.fromEntries(
    dateFormat.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.weekday ?? ''}, ${parts.day ?? ''} ${parts.month ?? ''}`;
}

/** The current time, refreshed every minute so the greeting changes at the right moment. */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, intervalMs);
    return () => {
      clearInterval(timer);
    };
  }, [intervalMs]);
  return now;
}

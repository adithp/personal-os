import type { ModuleId } from '@personal-os/shared';
import type { TablerIcon } from '@tabler/icons-react';
import {
  IconAffiliate,
  IconBrandGoogleDrive,
  IconBriefcase,
  IconCalendar,
  IconChecklist,
  IconFlame,
  IconLayoutDashboard,
  IconMail,
  IconNotes,
  IconSettings,
  IconSparkles,
  IconWallet,
} from '@tabler/icons-react';

/** One Tabler outline icon per module, used in the dock, tiles, and avatars. */
export const MODULE_ICONS: Record<ModuleId, TablerIcon> = {
  dashboard: IconLayoutDashboard,
  tasks: IconChecklist,
  habits: IconFlame,
  notes: IconNotes,
  graph: IconAffiliate,
  calendar: IconCalendar,
  mail: IconMail,
  drive: IconBrandGoogleDrive,
  projects: IconBriefcase,
  money: IconWallet,
  assistant: IconSparkles,
  settings: IconSettings,
};

/** CSS variable holding a module's color, e.g. var(--module-tasks). */
export function moduleColorVar(id: ModuleId): string {
  return `var(--module-${id})`;
}

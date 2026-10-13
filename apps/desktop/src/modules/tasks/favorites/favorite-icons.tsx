import { TEXT_ON_TILE, type FavoriteIcon } from '@personal-os/shared';
import {
  IconArchive,
  IconBolt,
  IconBook,
  IconBriefcase,
  IconCalendar,
  IconFlag,
  IconHash,
  IconHeart,
  IconHome,
  IconProgress,
  IconStar,
  IconTarget,
  type Icon,
} from '@tabler/icons-react';

/** The Tabler glyph for each icon name a favorite can use. */
export const FAVORITE_ICON_COMPONENTS: Record<FavoriteIcon, Icon> = {
  hash: IconHash,
  flag: IconFlag,
  calendar: IconCalendar,
  progress: IconProgress,
  archive: IconArchive,
  star: IconStar,
  bolt: IconBolt,
  briefcase: IconBriefcase,
  home: IconHome,
  heart: IconHeart,
  book: IconBook,
  target: IconTarget,
};

/** The 16 px pastel square with a 12 px dark glyph (the icon-square rule of docs/DESIGN.md). */
export function FavoriteSquare({ color, icon }: { color: string; icon: FavoriteIcon }) {
  const Glyph = FAVORITE_ICON_COMPONENTS[icon];
  return (
    <span
      aria-hidden
      className="flex size-4 shrink-0 items-center justify-center rounded-[5px]"
      style={{ backgroundColor: color, color: TEXT_ON_TILE }}
    >
      <Glyph size={12} stroke={2} />
    </span>
  );
}

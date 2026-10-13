import { useNavigate, useRouter } from '@tanstack/react-router';
import type { MouseEvent } from 'react';
import type { FavoriteView } from '@personal-os/shared';
import { favoriteViewToSearch } from './view';

/**
 * Opening a favorite means going to My tasks with the saved view as search params. Rows and tiles
 * are real links (so the keyboard and "copy link" work); a plain click goes through the router.
 */
export function useFavoriteLink() {
  const router = useRouter();
  const navigate = useNavigate();

  const hrefOf = (view: FavoriteView) =>
    router.buildLocation({ to: '/tasks/my-tasks', search: favoriteViewToSearch(view) }).href;

  const open = (view: FavoriteView) =>
    navigate({ to: '/tasks/my-tasks', search: favoriteViewToSearch(view) });

  const onClick = (event: MouseEvent<HTMLAnchorElement>, view: FavoriteView) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void open(view);
  };

  return { hrefOf, onClick };
}

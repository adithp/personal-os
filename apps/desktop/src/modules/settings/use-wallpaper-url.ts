import { useEffect, useState } from 'react';
import { wallpaperUrl } from './wallpaper-files';

/** Loadable URL of the uploaded wallpaper, or null while loading, when none is set, or on failure. */
export function useWallpaperUrl(file: string | null): string | null {
  const [resolved, setResolved] = useState<{ file: string; url: string } | null>(null);

  useEffect(() => {
    if (file === null) return;
    let cancelled = false;
    void wallpaperUrl(file).then((url) => {
      if (!cancelled && url !== null) setResolved({ file, url });
    });
    return () => {
      cancelled = true;
    };
  }, [file]);

  // Ignore a URL that belongs to a previous file.
  return file !== null && resolved?.file === file ? resolved.url : null;
}

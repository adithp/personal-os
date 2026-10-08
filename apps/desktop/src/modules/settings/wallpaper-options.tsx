import type { WallpaperSource } from '@personal-os/shared';
import { BLUR_RANGE, MAX_WALLPAPER_BYTES } from '@personal-os/shared';
import { Button, SegmentedControl, Slider } from '@personal-os/ui';
import { useState } from 'react';
import { useSettings } from '../../store/settings-store';
import { SettingRow } from './setting-row';
import { useWallpaperUrl } from './use-wallpaper-url';
import { chooseWallpaperImage, removeWallpaperFile } from './wallpaper-files';

const SOURCE_OPTIONS = [
  { value: 'builtin', label: 'Built-in gradient' },
  { value: 'custom', label: 'My image' },
] as const satisfies readonly { value: WallpaperSource; label: string }[];

const MESSAGES = {
  type: 'Choose a PNG, JPG, or WebP image.',
  size: `That image is larger than ${String(MAX_WALLPAPER_BYTES / 1024 / 1024)} MB.`,
  failed: 'Could not use that image. Try another one.',
  unavailable: 'Choosing an image only works in the desktop app.',
} as const;

/** Settings shown only while the background is Wallpaper: the image and the blur strength. */
export function WallpaperOptions() {
  const { wallpaperSource, wallpaperFile, blurPx, update } = useSettings();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const previewUrl = useWallpaperUrl(wallpaperFile);

  const choose = async () => {
    setError(undefined);
    setBusy(true);
    const result = await chooseWallpaperImage();
    setBusy(false);
    if (!result.ok) {
      if (result.reason !== 'cancelled') setError(MESSAGES[result.reason]);
      return;
    }
    const previous = wallpaperFile;
    update({ wallpaperSource: 'custom', wallpaperFile: result.file });
    if (previous) void removeWallpaperFile(previous);
  };

  const removeImage = () => {
    setError(undefined);
    const previous = wallpaperFile;
    update({ wallpaperSource: 'builtin', wallpaperFile: null });
    if (previous) void removeWallpaperFile(previous);
  };

  return (
    <>
      <SettingRow label="Image" description="A built-in gradient or a picture of your own.">
        {() => (
          <SegmentedControl
            label="Image"
            value={wallpaperSource}
            options={SOURCE_OPTIONS}
            onChange={(source) => {
              update({ wallpaperSource: source });
            }}
          />
        )}
      </SettingRow>

      {wallpaperSource === 'custom' && (
        <SettingRow
          label="Your image"
          description={
            wallpaperFile
              ? 'Shown behind the app.'
              : 'No image chosen yet, so the built-in gradient is shown.'
          }
        >
          {() => (
            <>
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="Your wallpaper"
                  className="size-10 rounded-chip border-[0.5px] border-glass-border object-cover"
                />
              )}
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  void choose();
                }}
              >
                {wallpaperFile ? 'Change image…' : 'Choose image…'}
              </Button>
              {wallpaperFile && (
                <Button variant="secondary" onClick={removeImage}>
                  Remove image
                </Button>
              )}
            </>
          )}
        </SettingRow>
      )}
      {error && (
        <p role="alert" className="py-2 text-small text-danger">
          {error}
        </p>
      )}

      <SettingRow label="Blur" description="How strongly glass panels blur what is behind them.">
        {(labelId) => (
          <>
            <Slider
              aria-labelledby={labelId}
              min={BLUR_RANGE.min}
              max={BLUR_RANGE.max}
              value={blurPx}
              onValueChange={(value) => {
                update({ blurPx: value });
              }}
            />
            <span className="w-11 text-right text-small text-fg-muted tabular-nums">
              {blurPx} px
            </span>
          </>
        )}
      </SettingRow>
    </>
  );
}

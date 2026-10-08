import type { BackgroundMode, DockIconSize, GlassEffect, ThemeMode } from '@personal-os/shared';
import { LIQUID_STRENGTH_RANGE, MODULES } from '@personal-os/shared';
import {
  Button,
  MODULE_ICONS,
  SegmentedControl,
  Slider,
  Switch,
  moduleColorVar,
} from '@personal-os/ui';
import { useRouter } from '@tanstack/react-router';
import { useAuthState } from '../../auth/use-auth-state';
import { useGlassSupport } from '../../store/glass-support-store';
import { useSettings } from '../../store/settings-store';
import { useWindowEffect } from '../../store/window-effect-store';
import { SettingRow, SettingsSection } from './setting-row';
import { WallpaperOptions } from './wallpaper-options';

const THEME_OPTIONS = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
] as const satisfies readonly { value: ThemeMode; label: string }[];

const BACKGROUND_OPTIONS = [
  { value: 'transparent', label: 'Transparent' },
  { value: 'wallpaper', label: 'Wallpaper' },
  { value: 'solid', label: 'Solid' },
] as const satisfies readonly { value: BackgroundMode; label: string }[];

const BACKGROUND_HELP: Record<BackgroundMode, string> = {
  transparent: 'Your desktop shows through the window, blurred.',
  wallpaper: 'A picture behind the app.',
  solid: 'A plain color.',
};

const GLASS_OPTIONS = [
  { value: 'liquid', label: 'Liquid' },
  { value: 'simple', label: 'Simple' },
  { value: 'off', label: 'Off' },
] as const satisfies readonly { value: GlassEffect; label: string }[];

const GLASS_HELP: Record<GlassEffect, string> = {
  liquid: 'Glass bends the background at its edges, with a bright rim and shine.',
  simple: 'Plain blurred glass.',
  off: 'Solid panels. Uses the least power.',
};

const ICON_SIZE_OPTIONS = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
] as const satisfies readonly { value: DockIconSize; label: string }[];

function AppearanceSection() {
  const { theme, backgroundMode, glassEffect, liquidStrength, update } = useSettings();
  const effectFailed = useWindowEffect((state) => state.status === 'failed');
  const liquidUnavailable = useGlassSupport((state) => state.liquidUnavailable);

  return (
    <SettingsSection title="Appearance">
      <SettingRow label="Theme" description="Dark, light, or follow Windows.">
        {() => (
          <SegmentedControl
            label="Theme"
            value={theme}
            options={THEME_OPTIONS}
            onChange={(value) => {
              update({ theme: value });
            }}
          />
        )}
      </SettingRow>

      <SettingRow label="Background" description={BACKGROUND_HELP[backgroundMode]}>
        {() => (
          <SegmentedControl
            label="Background"
            value={backgroundMode}
            options={BACKGROUND_OPTIONS}
            onChange={(value) => {
              update({ backgroundMode: value });
            }}
          />
        )}
      </SettingRow>

      {backgroundMode === 'transparent' && effectFailed && (
        <p role="status" className="py-2 text-small text-fg-secondary">
          Transparent is not available on this computer, so the wallpaper is shown instead.
        </p>
      )}

      {backgroundMode === 'wallpaper' && <WallpaperOptions />}

      <SettingRow label="Glass effect" description={GLASS_HELP[glassEffect]}>
        {() => (
          <SegmentedControl
            label="Glass effect"
            value={glassEffect}
            options={GLASS_OPTIONS}
            onChange={(value) => {
              update({ glassEffect: value });
            }}
          />
        )}
      </SettingRow>

      {glassEffect === 'liquid' && liquidUnavailable && (
        <p role="status" className="py-2 text-small text-fg-secondary">
          Liquid glass is not available on this computer, so simple glass is shown instead.
        </p>
      )}

      {glassEffect === 'liquid' && (
        <SettingRow label="Strength" description="How strongly the edges bend the background.">
          {(labelId) => (
            <>
              <Slider
                aria-labelledby={labelId}
                min={LIQUID_STRENGTH_RANGE.min}
                max={LIQUID_STRENGTH_RANGE.max}
                value={liquidStrength}
                onValueChange={(value) => {
                  update({ liquidStrength: value });
                }}
              />
              <span className="w-8 text-right text-small text-fg-muted tabular-nums">
                {liquidStrength}
              </span>
            </>
          )}
        </SettingRow>
      )}
    </SettingsSection>
  );
}

function DockSection() {
  const { dockAutoHide, dockMagnification, dockIconSize, update } = useSettings();

  return (
    <SettingsSection title="Dock">
      <SettingRow
        label="Auto-hide"
        description="Hide the dock until the cursor reaches the bottom."
      >
        {(labelId) => (
          <Switch
            aria-labelledby={labelId}
            checked={dockAutoHide}
            onCheckedChange={(checked) => {
              update({ dockAutoHide: checked });
            }}
          />
        )}
      </SettingRow>

      <SettingRow label="Magnification" description="Icons grow as the cursor moves over them.">
        {(labelId) => (
          <Switch
            aria-labelledby={labelId}
            checked={dockMagnification}
            onCheckedChange={(checked) => {
              update({ dockMagnification: checked });
            }}
          />
        )}
      </SettingRow>

      <SettingRow label="Icon size">
        {() => (
          <SegmentedControl
            label="Icon size"
            value={dockIconSize}
            options={ICON_SIZE_OPTIONS}
            onChange={(value) => {
              update({ dockIconSize: value });
            }}
          />
        )}
      </SettingRow>
    </SettingsSection>
  );
}

function AccountSection() {
  const { auth } = useRouter().options.context;
  const email = useAuthState(auth, (state) => state.email);

  return (
    <SettingsSection title="Account">
      <SettingRow label="Signed in" description={email ?? 'Your account'}>
        {() => (
          <Button
            variant="secondary"
            onClick={() => {
              void auth.signOut();
            }}
          >
            Log out
          </Button>
        )}
      </SettingRow>
    </SettingsSection>
  );
}

/** Appearance, dock, and account settings. Appearance and dock are saved on this device. */
export function SettingsPage() {
  const Icon = MODULE_ICONS.settings;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
      <div className="flex items-center gap-3">
        <span
          data-module="settings"
          className="flex size-8 items-center justify-center rounded-control text-on-tile"
          style={{ backgroundColor: moduleColorVar('settings') }}
        >
          <Icon size={18} stroke={1.75} aria-hidden />
        </span>
        <h1 className="text-page font-semibold text-fg">{MODULES.settings.name}</h1>
      </div>
      <AppearanceSection />
      <DockSection />
      <AccountSection />
    </div>
  );
}

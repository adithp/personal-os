# Settings

## Purpose
Change how the app looks and behaves on this device, and sign out.

## Screen
A centered column (max 672 px) with the Settings icon square (gray) and the title, then three glass cards: Appearance, Dock, Account. Each row has a label and a short description on the left and the control on the right. Opens with Ctrl , (or from the dock).

## Appearance
1. **Theme:** Dark, Light, or System (default). System follows Windows live.
2. **Background:** Transparent (default), Wallpaper, or Solid. The description changes with the choice. If Transparent is chosen but the Acrylic and Mica effect fails, the screen says "Transparent is not available on this computer, so the wallpaper is shown instead." The app uses Wallpaper for that session; the saved choice stays Transparent.
3. Only for **Wallpaper**:
   - Image: "Built-in gradient" (dark or light by theme, default) or "My image".
   - With "My image": a 40 px preview, "Choose image…" (then "Change image…"), and "Remove image". PNG, JPG, JPEG, or WebP up to 20 MB. The file is copied into the app data folder (wallpapers/wallpaper-<time>.<ext>); the original is never touched, and replacing or removing deletes the old copy. Messages: "Choose a PNG, JPG, or WebP image.", "That image is larger than 20 MB.", "Could not use that image. Try another one.", "Choosing an image only works in the desktop app.", and "No image chosen yet, so the built-in gradient is shown."
   - Blur: a slider from 0 to 40 px (default 24).
4. **Glass effect:** Liquid (default), Simple, or Off. If Liquid cannot be drawn on this computer the screen says "Liquid glass is not available on this computer, so simple glass is shown instead." (see docs/DESIGN.md section 2b).
5. Only for **Liquid**: Strength, a slider from 0 to 100 (default 50).

## Dock
- Auto-hide (default off), Magnification (default on), Icon size: Small, Medium (default), or Large (32, 36, 44 px).

## Account
- Shows the signed-in email and a "Log out" button. It signs out on this device only and returns to the login screen.
- A read-only "Live updates" row shows whether changes made elsewhere reach this app: On, Connecting…, Reconnecting…, or Off (signed out or not configured). After reconnecting the app refreshes everything it shows. It has no switch.

## Storage
- Saved on this device only (localStorage key personal-os.settings, version 2): theme, backgroundMode, glassEffect, liquidStrength, blurPx, wallpaperSource, wallpaperFile, dockAutoHide, dockMagnification, dockIconSize. Invalid saved values fall back to the defaults field by field; an old wallpaper On/Off setting migrates (Off becomes Solid).
- Changes apply at once. There is no "reset to defaults" button.
- ROADMAP Step 3 moves these settings to the server settings table through the action registry, and adds Settings → AI.
- The command palette can also switch the theme and toggle dock auto-hide.
- The Tauri side: the window is frameless and transparent (1280×800, minimum 1100×700) with the window shadow on; permissions allow the window effects, the file dialog, and file copy and delete only inside $APPDATA/wallpapers.

## Done when
I can change the look and the dock without restarting, and my choices are still there after a restart.

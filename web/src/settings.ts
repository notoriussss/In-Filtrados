// Player settings (maqueta 08-ajustes). They live only in this browser:
// the server never sees them, so they stay out of messages/ and proto/.
// Only settings the client can already honour are here; audio, pixel
// scale and key rebinding come back when the game supports them.

export type Settings = {
  highContrast: boolean;
  reduceMotion: boolean;
};

export const SETTINGS_KEY = 'in-filtrados-settings';

// reduceMotion starts from the system preference the first time.
export function defaultSettings(systemReducesMotion = false): Settings {
  return { highContrast: false, reduceMotion: systemReducesMotion };
}

// sanitizeSettings keeps only known boolean fields; anything else in
// storage (old versions, hand edits) falls back to the defaults.
export function sanitizeSettings(raw: unknown, base: Settings): Settings {
  if (typeof raw !== 'object' || raw === null) return base;
  const data = raw as Record<string, unknown>;
  return {
    highContrast:
      typeof data.highContrast === 'boolean'
        ? data.highContrast
        : base.highContrast,
    reduceMotion:
      typeof data.reduceMotion === 'boolean'
        ? data.reduceMotion
        : base.reduceMotion,
  };
}

function systemReducesMotion(): boolean {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function safeStorage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export function loadSettings(
  storage: Pick<Storage, 'getItem'> | null = safeStorage(),
): Settings {
  const base = defaultSettings(systemReducesMotion());
  try {
    const item = storage?.getItem(SETTINGS_KEY);
    return item ? sanitizeSettings(JSON.parse(item), base) : base;
  } catch (error) {
    console.warn('No se pudieron leer los ajustes de localStorage', error);
    return base;
  }
}

export function saveSettings(
  settings: Settings,
  storage: Pick<Storage, 'setItem'> | null = safeStorage(),
): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('No se pudieron guardar los ajustes en localStorage', error);
  }
}

// applySettings writes the settings as data attributes on <html>; the
// rules that react to them are in styles/app.css.
export function applySettings(
  settings: Settings,
  root: HTMLElement = document.documentElement,
): void {
  root.dataset.contrast = settings.highContrast ? 'high' : 'normal';
  root.dataset.motion = settings.reduceMotion ? 'reduced' : 'normal';
}

export function motionIsReduced(
  root: HTMLElement = document.documentElement,
): boolean {
  return root.dataset.motion === 'reduced';
}

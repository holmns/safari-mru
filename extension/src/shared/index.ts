export type TabId = number;
export type WindowId = number;

export type LayoutMode = "horizontal" | "vertical";
export type ThemeMode = "dark" | "light" | "system";

export interface HudSettings {
  hudDelay: number;
  layout: LayoutMode;
  theme: ThemeMode;
}

export const HUD_DELAY_MIN = 0;
export const HUD_DELAY_MAX = 1000;

export const DEFAULT_SETTINGS: HudSettings = {
  hudDelay: 150,
  layout: "horizontal",
  theme: "system",
};

export function clampHudDelay(
  value: unknown,
  fallback: number = DEFAULT_SETTINGS.hudDelay
): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const rounded = Math.round(numeric);
  if (rounded < HUD_DELAY_MIN) return HUD_DELAY_MIN;
  if (rounded > HUD_DELAY_MAX) return HUD_DELAY_MAX;
  return rounded;
}

export function parseLayoutMode(
  value: unknown,
  fallback: LayoutMode = DEFAULT_SETTINGS.layout
): LayoutMode {
  if (value === "vertical" || value === "horizontal") {
    return value;
  }
  return fallback;
}

export function parseThemeMode(
  value: unknown,
  fallback: ThemeMode = DEFAULT_SETTINGS.theme
): ThemeMode {
  if (value === "dark" || value === "light" || value === "system") {
    return value;
  }
  return fallback;
}

export function normalizeHudSettings(
  input: Partial<HudSettings> | undefined,
  fallback: HudSettings = DEFAULT_SETTINGS
): HudSettings {
  return {
    hudDelay: clampHudDelay(input?.hudDelay, fallback.hudDelay),
    layout: parseLayoutMode(input?.layout, fallback.layout),
    theme: parseThemeMode(input?.theme, fallback.theme),
  };
}

export interface HudItem {
  id: TabId;
  title: string;
  favIconUrl?: string;
  pinned?: boolean;
}

export interface HudItemsResponse {
  items?: HudItem[];
}

export type HudRequestMessage = { type: "mru-request" };

export type HudFinalizeMessage = { type: "mru-finalize"; index?: number };

export type HudMessage = HudRequestMessage | HudFinalizeMessage;

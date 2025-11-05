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

export const FALLBACK_FAVICON_DATA_URI = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAYAAAAeP4ixAAAACXBIWXMAAAsTAAALEwEAmpwYAAAFX0lEQVR4nO2a228WVRTFC02xDWmtVV/wxXLzSRT1waQIXoi36IMXUEmUNngD1AZIKvgkeMGYaPQfsKhPUqOJSrzilQhi0YJJFUR5sYqIoeKFooSf2c06ye50vpnz9ZvSYlxJk87sNefMnnP2Ofus/VVV/Y84AKfZX9XJAmA6cDfwArAd6Gc4+mV7HrjLnqkaDwCagJVADyPHl8CKMRk14HTgSeCwe6HfgGPu+iVgjru+BNjoro/pmQBr6wn7OCfCgQnAEuCge4G3gFuBh3T9F3CHe2YQ7noxcES31wC3AW+79g4AbdbXaE6j11yHHwMtss0D/gGOAzcnnhviiO4tENeemad7NnqfuPZfLXy6AecA+9wUWOxsNcDXsj2c8uwwR3R/nUz2bI273wr8Ltt3wIyinLhAw23YkVxpFKiGb4BJZTgyCdgt88qEbYb6MvwMzC5iJIITHwD1CXuds19doo1UR2S71sVFXcJWD3zonJleSUyE6dQLTE7h2L5h6Mlop6Qjsu8U5c4U22Q3bfcCjSNZnXxgo2mw3DcGbJPt3gocWSbKVnfvVGCpm3oBr5S1mtnXcYHdoa8R8LeWyzWOU1+BIw0uuDuATcCA6+9bYJXbs1rL2ezCPrFM96ptWdWeYY54/CHHnrWRAa4CLgKm2ug5nn3lZi0eV2paPg286Rzxm+W7Wqar9Q42G0K85C/L2rHDPjGxROy0uiAvEr8oBzsjpd+Jbp9Zn+dEkxvClpwYCknhxcB1mhbP6Ut2A98Dh9xL9mvxsGX1PWADsBq4wfpynAkZ/Vqag1Kb0qOiuWj4LCLTNfyQ+WUiYsTxfhR1Wg7vU/Has0ghi70xpzGbu4bXC3TEgpxkipPR9468r/wnUJvT2OPiri3QkUdEfSyHV6fE1NBclbG5vRHR6cviLizQEcugDRsjuLbSGZakGe1kZ7g/oiFLVwyXFejI5aK+H8FtF3dDmvFzGS+NaOgrcc8t0JFZou6K4M4Xd1ua8VDJeTec2yfulAIdmSJqXwR3mri/Jg3VOugc82eDjIaOqqFTCnTE0np7h6MR3Bq96/Ehm7bSh5MVDf9JR6rLnFohO62N4A4iglcr6sCIp9Y4Cfazygh2y6yHB7uMpgDGLr+7xJ1VoCPni7ozgntF8jDmjSZjjuWGGF6unA2xM81o5wDDpoiGusS9ZRRSlK5KUxSfNA5RNDKSxnVjnDSeXYpkgrLhppzG7Ngbm2COVhrfnUUyZd2wPTJF6CvQkZ9EnZrD2yreA3lFmXDUnRN51G3RcdVUlRctWDWy+xI1kn4df/1R147H1+u4HDhZR925jpetcUnazxIfztTCYEJB0TggYaOphPiwJSaOvAARFJLlbudfCGxO1ECQlGOryFNycL4kn+aEHNSojexCyUH3AM9ISjJJycMkp3cSctB9su2PVhxVn0DTbJVEsoABBWaHc6Qho61B5Ah0h5VurJZ2FrLroMg/6Kb87VFOuBiw+oTHbglwDSmS6dIKHDFpNCmZNkpKNYXfI3ePKRX49jWQkDxaInZPjojdK/sey9LLdsTVKUyiRBJ/VlnhmoLLCg3ARy4uMvWuGGdmO2e+AGaOQqFnRcI2023O5sR5FTmRGJm9LrjbSpTe1pbhSEhJehOltzYnau+peCRSOm5UfSJgS9g0E8XQBXmOaCkPxdC5Ttfd4gN7xDERuZq1uqmG1vtFrjx9xNcwko7oeV+eXiThO2B/WUtshQ7ZirY+UfBP/mCgy6nn6P+gUCJu8gcHj5ZdXivQoXZXgR0JutXGiXcgDUpJ7FcRnVaWsPN0yksf1CbaKW76eWI8QovE+PjaVScB/gUcpqAaAuI+2AAAAABJRU5ErkJggg==`;

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
  favIconUrl: string;
  pinned?: boolean;
}

export interface HudTitleSource {
  title?: string | null;
  url?: string | null;
  pendingUrl?: string | null;
}

export function resolveHudTitle(source: HudTitleSource): string {
  const trimmedTitle = source.title?.trim();
  if (trimmedTitle) return trimmedTitle;

  const canonicalUrl = source.url?.trim() || source.pendingUrl?.trim();
  if (canonicalUrl) return canonicalUrl;

  return "Untitled";
}

export interface HudItemsResponse {
  items?: HudItem[];
}

export interface HudRequestMessage {
  type: "mru-request";
}

export interface HudFinalizeMessage {
  type: "mru-finalize";
  index?: number;
}

export type HudMessage = HudRequestMessage | HudFinalizeMessage;

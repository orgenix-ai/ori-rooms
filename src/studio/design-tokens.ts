import { z } from "zod";

export const DESIGN_DIRECTIONS = [
  "calm-ops",
  "warm-craft",
  "bold-signal",
] as const;

export type DesignDirectionId = (typeof DESIGN_DIRECTIONS)[number];

export const designDirectionIdSchema = z.enum(DESIGN_DIRECTIONS);

export const designDensitySchema = z.enum([
  "compact",
  "comfortable",
  "spacious",
]);

export const designSchemeSchema = z.enum(["dark", "light"]);

export const designPinsSchema = z
  .object({
    accent: z.string().trim().min(1).max(64).optional(),
    typeFamily: z.string().trim().min(1).max(120).optional(),
    density: designDensitySchema.optional(),
    scheme: designSchemeSchema.optional(),
    primaryOnly: z.boolean().optional(),
  })
  .strict();

export type DesignPins = z.infer<typeof designPinsSchema>;

export const designTokenColorsSchema = z
  .object({
    background: z.string().trim().min(1).max(64),
    foreground: z.string().trim().min(1).max(64),
    surface: z.string().trim().min(1).max(64),
    surfaceMuted: z.string().trim().min(1).max(64),
    accent: z.string().trim().min(1).max(64),
    accentForeground: z.string().trim().min(1).max(64),
    secondary: z.string().trim().min(1).max(64).optional(),
    border: z.string().trim().min(1).max(64),
    muted: z.string().trim().min(1).max(64),
    focusRing: z.string().trim().min(1).max(64),
  })
  .strict();

export const designTokensSchema = z
  .object({
    directionId: designDirectionIdSchema,
    /** The Studio look these tokens were drawn from (docs/product/STUDIO-LOOKS.md). */
    lookId: z.string().trim().min(1).max(40).optional(),
    pins: designPinsSchema.default({}),
    colors: designTokenColorsSchema,
    typography: z
      .object({
        fontFamily: z.string().trim().min(1).max(160),
        displayFamily: z.string().trim().min(1).max(160).optional(),
        scaleRatio: z.number().min(1.05).max(1.5),
        baseSizePx: z.number().min(12).max(20),
      })
      .strict(),
    space: z
      .object({
        density: designDensitySchema,
        unit: z.number().min(2).max(12),
      })
      .strict(),
    radius: z
      .object({
        sm: z.number().min(0).max(24),
        md: z.number().min(0).max(32),
        lg: z.number().min(0).max(48),
      })
      .strict(),
  })
  .strict();

export type DesignTokens = z.infer<typeof designTokensSchema>;

export const repairLogEntrySchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    at: z.string().datetime(),
    rule: z.string().trim().min(1).max(120),
    message: z.string().trim().min(1).max(500),
    changed: z.array(z.string().trim().min(1).max(80)).max(20),
  })
  .strict();

export type RepairLogEntry = z.infer<typeof repairLogEntrySchema>;

/** Direction seeds — dark studio shell; teal / warm / rose accents (not purple/cream AI defaults). */
export const DIRECTION_SEEDS: Record<
  DesignDirectionId,
  Omit<DesignTokens, "pins">
> = {
  "calm-ops": {
    directionId: "calm-ops",
    colors: {
      background: "#0e1116",
      foreground: "#e8e4dc",
      surface: "#171b22",
      surfaceMuted: "#1e242e",
      accent: "#2dd4bf",
      accentForeground: "#06241f",
      secondary: "#64748b",
      border: "#2a3140",
      muted: "#9a958c",
      focusRing: "#5eead4",
    },
    typography: {
      fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif',
      displayFamily: '"IBM Plex Sans", "Segoe UI", sans-serif',
      scaleRatio: 1.2,
      baseSizePx: 15,
    },
    space: { density: "comfortable", unit: 4 },
    radius: { sm: 4, md: 8, lg: 12 },
  },
  "warm-craft": {
    directionId: "warm-craft",
    colors: {
      background: "#14110e",
      foreground: "#f3ebe3",
      surface: "#1c1814",
      surfaceMuted: "#26201a",
      accent: "#d4a574",
      accentForeground: "#2a1a0c",
      secondary: "#8b7355",
      border: "#3a322a",
      muted: "#b5a99a",
      focusRing: "#e8c4a0",
    },
    typography: {
      fontFamily: '"Source Serif 4", Georgia, serif',
      displayFamily: '"Fraunces", Georgia, serif',
      scaleRatio: 1.25,
      baseSizePx: 16,
    },
    space: { density: "spacious", unit: 5 },
    radius: { sm: 6, md: 10, lg: 16 },
  },
  "bold-signal": {
    directionId: "bold-signal",
    colors: {
      background: "#0a0a0b",
      foreground: "#fafafa",
      surface: "#141416",
      surfaceMuted: "#1c1c20",
      accent: "#e11d48",
      accentForeground: "#fff1f2",
      secondary: "#fb7185",
      border: "#2e2e34",
      muted: "#a1a1aa",
      focusRing: "#fb7185",
    },
    typography: {
      fontFamily: '"Space Grotesk", "Segoe UI", sans-serif',
      displayFamily: '"Space Grotesk", "Segoe UI", sans-serif',
      scaleRatio: 1.333,
      baseSizePx: 15,
    },
    space: { density: "compact", unit: 4 },
    radius: { sm: 2, md: 4, lg: 8 },
  },
};

/** Light surfaces for each direction — accent still comes from seed/pin. */
export const DIRECTION_LIGHT_COLORS: Record<
  DesignDirectionId,
  Pick<
    DesignTokens["colors"],
    | "background"
    | "foreground"
    | "surface"
    | "surfaceMuted"
    | "secondary"
    | "border"
    | "muted"
    | "accentForeground"
  >
> = {
  "calm-ops": {
    background: "#f4f6f8",
    foreground: "#12151a",
    surface: "#ffffff",
    surfaceMuted: "#e8ecf1",
    secondary: "#64748b",
    border: "#cfd6e0",
    muted: "#5c6570",
    accentForeground: "#06241f",
  },
  "warm-craft": {
    background: "#f7f1ea",
    foreground: "#1c1612",
    surface: "#fffaf5",
    surfaceMuted: "#efe4d8",
    secondary: "#8b7355",
    border: "#d9cbb8",
    muted: "#6e6256",
    accentForeground: "#2a1a0c",
  },
  "bold-signal": {
    background: "#f6f6f7",
    foreground: "#111113",
    surface: "#ffffff",
    surfaceMuted: "#ececef",
    secondary: "#9f1239",
    border: "#d4d4d8",
    muted: "#52525b",
    accentForeground: "#fff1f2",
  },
};

/** Space unit (px) derived from a density pin so preview rhythm changes visibly. */
export const DENSITY_SPACE_UNIT: Record<
  z.infer<typeof designDensitySchema>,
  number
> = {
  compact: 3,
  comfortable: 4,
  spacious: 6,
};

export function tokensFromDirection(
  directionId: DesignDirectionId,
  pins: DesignPins = {},
): DesignTokens {
  const seed = DIRECTION_SEEDS[directionId];
  const density = pins.density ?? seed.space.density;
  const scheme = pins.scheme ?? "dark";
  const light = scheme === "light" ? DIRECTION_LIGHT_COLORS[directionId] : null;
  return designTokensSchema.parse({
    ...seed,
    pins,
    colors: {
      ...seed.colors,
      ...(light ?? {}),
      ...(pins.accent ? { accent: pins.accent } : {}),
      focusRing: pins.accent ?? seed.colors.focusRing,
    },
    typography: {
      ...seed.typography,
      ...(pins.typeFamily
        ? { fontFamily: pins.typeFamily, displayFamily: pins.typeFamily }
        : {}),
    },
    space: {
      density,
      unit: pins.density
        ? DENSITY_SPACE_UNIT[pins.density]
        : seed.space.unit,
    },
  });
}

export function designTokensCssVars(tokens: DesignTokens): Record<string, string> {
  return {
    "--ds-bg": tokens.colors.background,
    "--ds-fg": tokens.colors.foreground,
    "--ds-surface": tokens.colors.surface,
    "--ds-surface-muted": tokens.colors.surfaceMuted,
    "--ds-accent": tokens.colors.accent,
    "--ds-accent-fg": tokens.colors.accentForeground,
    "--ds-border": tokens.colors.border,
    "--ds-muted": tokens.colors.muted,
    "--ds-focus": tokens.colors.focusRing,
    "--ds-font": tokens.typography.fontFamily,
    "--ds-display": tokens.typography.displayFamily ?? tokens.typography.fontFamily,
    "--ds-radius-md": `${tokens.radius.md}px`,
    "--ds-space": `${tokens.space.unit}px`,
  };
}

/**
 * When the PO picks a new Direction, keep density/scheme pins but drop accent and
 * type so the new seed palette/type actually show (not the previous direction’s).
 */
export function pinsAfterDirectionChange(previous: DesignPins): DesignPins {
  return designPinsSchema.parse({
    ...(previous.density ? { density: previous.density } : {}),
    ...(previous.scheme ? { scheme: previous.scheme } : {}),
    ...(previous.primaryOnly !== undefined
      ? { primaryOnly: previous.primaryOnly }
      : {}),
  });
}

/**
 * If accent exactly matches a direction seed, treat that direction as the visual
 * family — keeps Suggested badge / selection aligned with yellow/teal/red look.
 */
export function directionIdForSeedAccent(
  accent: string | undefined,
  fallback: DesignDirectionId,
): DesignDirectionId {
  if (!accent?.trim()) return fallback;
  const key = accent.trim().toLowerCase();
  for (const id of DESIGN_DIRECTIONS) {
    if (DIRECTION_SEEDS[id].colors.accent.toLowerCase() === key) {
      return id;
    }
  }
  return fallback;
}

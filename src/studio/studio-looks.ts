import { z } from "zod";

import {
  DENSITY_SPACE_UNIT,
  DIRECTION_SEEDS,
  designDensitySchema,
  designTokensSchema,
  type DesignDirectionId,
  type DesignPins,
  type DesignTokens,
} from "./design-tokens";

/**
 * Studio looks (docs/product/STUDIO-LOOKS.md): three looks made for each app,
 * each a full theme in the app template's format (templates/app/design/theme.json),
 * so the build can take the chosen one as it is.
 */

type FontCategory = "sans" | "serif" | "mono";

/**
 * The template's font catalog (templates/app/scripts/theme/fonts.ts), which the
 * theme generator knows how to load. A test keeps the two in step.
 */
export const STUDIO_LOOK_FONTS: Record<
  string,
  { category: FontCategory; maxWeight?: number; displayOnly?: true }
> = {
  Inter: { category: "sans" },
  "Inter Tight": { category: "sans" },
  Geist: { category: "sans" },
  Manrope: { category: "sans" },
  "DM Sans": { category: "sans" },
  "Plus Jakarta Sans": { category: "sans" },
  Figtree: { category: "sans" },
  Onest: { category: "sans" },
  Outfit: { category: "sans" },
  Sora: { category: "sans" },
  "Space Grotesk": { category: "sans" },
  "Instrument Sans": { category: "sans" },
  "Hanken Grotesk": { category: "sans" },
  "Schibsted Grotesk": { category: "sans" },
  "Bricolage Grotesque": { category: "sans" },
  "Nunito Sans": { category: "sans" },
  "Public Sans": { category: "sans" },
  "Work Sans": { category: "sans" },
  "Source Sans 3": { category: "sans" },
  "IBM Plex Sans": { category: "sans" },
  "Familjen Grotesk": { category: "sans" },
  Epilogue: { category: "sans" },
  Gabarito: { category: "sans" },
  "Rethink Sans": { category: "sans" },
  Archivo: { category: "sans" },
  Syne: { category: "sans", displayOnly: true },
  Unbounded: { category: "sans", displayOnly: true },
  Oswald: { category: "sans", displayOnly: true },
  Anton: { category: "sans", maxWeight: 400, displayOnly: true },
  Newsreader: { category: "serif" },
  Fraunces: { category: "serif" },
  "Source Serif 4": { category: "serif" },
  Literata: { category: "serif" },
  Lora: { category: "serif" },
  "Playfair Display": { category: "serif" },
  "EB Garamond": { category: "serif" },
  "Crimson Pro": { category: "serif" },
  "Cormorant Garamond": { category: "serif", displayOnly: true },
  "IBM Plex Serif": { category: "serif", maxWeight: 700 },
  "Bodoni Moda": { category: "serif", displayOnly: true },
  "Instrument Serif": { category: "serif", maxWeight: 400, displayOnly: true },
  "DM Serif Display": { category: "serif", maxWeight: 400, displayOnly: true },
  "Young Serif": { category: "serif", maxWeight: 400, displayOnly: true },
  Gloock: { category: "serif", maxWeight: 400, displayOnly: true },
  "JetBrains Mono": { category: "mono" },
  "Space Mono": { category: "mono", maxWeight: 700 },
  "DM Mono": { category: "mono", maxWeight: 500 },
  "Geist Mono": { category: "mono" },
  "Fira Code": { category: "mono" },
  "IBM Plex Mono": { category: "mono", maxWeight: 600 },
};

const FALLBACK_STACKS: Record<FontCategory, string> = {
  sans: "ui-sans-serif, system-ui, sans-serif",
  serif: "Georgia, serif",
  mono: "ui-monospace, monospace",
};

const hex = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "a six-digit hex colour like #4f46e5")
  .transform((value) => value.toLowerCase());

const font = z
  .string()
  .trim()
  .refine((family) => family in STUDIO_LOOK_FONTS, "a font from the template's catalog");

/** The template's theme (templates/app/scripts/theme/schema.ts), with its defaults filled in. */
export const studioLookThemeSchema = z
  .object({
    mood: z.enum(["bold", "calm", "playful"]),
    palette: z
      .object({
        accent: hex,
        accentDark: hex.optional(),
        neutral: hex,
        success: hex.default("#16a34a"),
        warning: hex.default("#d97706"),
        danger: hex.default("#dc2626"),
      })
      .strict(),
    fonts: z
      .object({ display: font, body: font, mono: font.default("JetBrains Mono") })
      .strict()
      .refine(
        ({ display, body }) => !(display.startsWith(body) || body.startsWith(display)),
        "display and body must be different families",
      )
      .refine(({ body }) => !STUDIO_LOOK_FONTS[body]?.displayOnly, "the body face must be readable as body text")
      .refine(({ mono }) => STUDIO_LOOK_FONTS[mono]?.category === "mono", "the mono face must be a mono font"),
    radius: z.number().min(0).max(24),
    radiusMax: z.number().min(0).max(32).optional(),
    density: designDensitySchema,
    contrast: z.enum(["standard", "high"]).default("standard"),
    type: z
      .object({
        base: z.number().min(16).max(19).default(16),
        ratio: z.number().min(1.1).max(1.4).default(1.2),
        headingWeight: z.number().int().min(400).max(800).default(600),
        meta: z.enum(["mono", "small-caps"]).default("mono"),
      })
      .strict()
      .default({ base: 16, ratio: 1.2, headingWeight: 600, meta: "mono" }),
    layout: z
      .object({
        shell: z.enum(["rail", "masthead"]).default("rail"),
        width: z.enum(["reading", "standard", "wide"]).default("standard"),
        headerSearch: z.boolean().default(false),
      })
      .strict()
      .default({ shell: "rail", width: "standard", headerSearch: false }),
    imagery: z
      .object({
        treatment: z.enum(["natural", "tint", "duotone", "mono"]).default("natural"),
        halftone: z.boolean().default(false),
        grain: z.boolean().default(false),
      })
      .strict()
      .default({ treatment: "natural", halftone: false, grain: false }),
  })
  .strict()
  .refine(
    (theme) => theme.type.headingWeight <= (STUDIO_LOOK_FONTS[theme.fonts.display]?.maxWeight ?? 900),
    { message: "the heading weight is heavier than the display face ships", path: ["type", "headingWeight"] },
  );

export type StudioLookTheme = z.infer<typeof studioLookThemeSchema>;

export const STUDIO_LOOK_SEEDS = ["calm-ops", "warm-craft", "bold-signal"] as const satisfies readonly DesignDirectionId[];

export const studioLookSchema = z
  .object({
    id: z.string().trim().min(1).max(40),
    /** What the founder sees on the card: a name and one plain sentence. */
    name: z.string().trim().min(1).max(40),
    summary: z.string().trim().min(1).max(200),
    moodWords: z.array(z.string().trim().min(1).max(24)).min(1).max(4),
    /** "Inspired by your examples: …", only when the founder gave references. */
    inspiredBy: z.string().trim().min(1).max(200).optional(),
    /** The Studio preview's surfaces; the built app carries both schemes. */
    scheme: z.enum(["light", "dark"]),
    theme: studioLookThemeSchema,
    source: z.enum(["generated", "fallback"]),
    /** Which default a fallback look reinterprets. */
    fallbackSeed: z.enum(STUDIO_LOOK_SEEDS).optional(),
    /** Which redraw of the fallback this is: each one changes layout, light or dark, density and imagery. */
    variant: z.number().int().min(0).max(1000).optional(),
  })
  .strict();

export type StudioLook = z.infer<typeof studioLookSchema>;

/** What Studio learned about the app before it drew the looks. */
export const studioIdentitySchema = z
  .object({
    summary: z.string().trim().min(1).max(300),
    audience: z.string().trim().min(1).max(200),
    moodWords: z.array(z.string().trim().min(1).max(24)).min(1).max(6),
  })
  .strict();

export type StudioIdentity = z.infer<typeof studioIdentitySchema>;

// ---------------------------------------------------------------------------
// Colour: sRGB hex ↔ OKLCH, enough for hue distance and derived surfaces.

type Oklch = { l: number; c: number; h: number };

function toLinear(channel: number): number {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function fromLinear(value: number): number {
  const s = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, s)) * 255);
}

export function hexToOklch(color: string): Oklch {
  const raw = color.replace(/^#/, "");
  const [r, g, b] = [0, 2, 4].map((at) => toLinear(Number.parseInt(raw.slice(at, at + 2), 16)));
  const l = Math.cbrt(0.4122214708 * r! + 0.5363325363 * g! + 0.0514459929 * b!);
  const m = Math.cbrt(0.2119034982 * r! + 0.6806995451 * g! + 0.1073969566 * b!);
  const s = Math.cbrt(0.0883024619 * r! + 0.2817188376 * g! + 0.6299787005 * b!);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const h = (Math.atan2(B, A) * 180) / Math.PI;
  return { l: L, c: Math.hypot(A, B), h: h < 0 ? h + 360 : h };
}

function oklchToLinear({ l, c, h }: Oklch): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

/** OKLCH to hex, lowering chroma until the colour fits sRGB. */
export function oklchToHex(color: Oklch): string {
  let c = color.c;
  let rgb = oklchToLinear({ ...color, c });
  while (c > 0 && rgb.some((v) => v < -0.0005 || v > 1.0005)) {
    c = Math.max(0, c - 0.005);
    rgb = oklchToLinear({ ...color, c });
  }
  return `#${rgb.map((v) => fromLinear(v).toString(16).padStart(2, "0")).join("")}`;
}

function luminance(color: string): number {
  const raw = color.replace(/^#/, "");
  const [r, g, b] = [0, 2, 4].map((at) => toLinear(Number.parseInt(raw.slice(at, at + 2), 16)));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** Near-black or near-white text, whichever has more WCAG contrast on the colour. */
export function readableOn(color: string): string {
  const l = luminance(color);
  const onDark = (l + 0.05) / (luminance("#0a0a0b") + 0.05);
  const onLight = (luminance("#fafafa") + 0.05) / (l + 0.05);
  return onDark >= onLight ? "#0a0a0b" : "#fafafa";
}

/** WCAG contrast of the better of near-black and near-white text on the colour. */
export function accentTextContrast(color: string): number {
  const l = luminance(color);
  return Math.max((l + 0.05) / (luminance("#0a0a0b") + 0.05), (luminance("#fafafa") + 0.05) / (l + 0.05));
}

/** Buttons carry small text on the accent, so it must reach WCAG AA with black or white. */
export const MIN_ACCENT_TEXT_CONTRAST = 4.5;

/** Below this chroma an accent reads as grey, so its hue says nothing. */
const ACHROMATIC = 0.04;

export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// ---------------------------------------------------------------------------
// The difference check (STUDIO-LOOKS § Decision 2).

export const MIN_ACCENT_HUE_DISTANCE = 60;

export type LookDifferenceViolation = {
  looks: [string, string];
  rule: "accent-hue" | "display-font" | "layout-or-surface" | "copies-default";
  detail: string;
};

function radiusShape(radius: number): "sharp" | "soft" | "round" {
  return radius <= 4 ? "sharp" : radius <= 12 ? "soft" : "round";
}

function accentsClose(a: string, b: string): string | null {
  const x = hexToOklch(a);
  const y = hexToOklch(b);
  const greyX = x.c < ACHROMATIC;
  const greyY = y.c < ACHROMATIC;
  if (greyX && greyY) return "both accents are grey";
  if (greyX !== greyY) return null;
  const distance = hueDistance(x.h, y.h);
  return distance < MIN_ACCENT_HUE_DISTANCE
    ? `accent hues ${Math.round(distance)}° apart (need ${MIN_ACCENT_HUE_DISTANCE}°)`
    : null;
}

/**
 * Pairwise rules for a set of looks: accent hues at least 60° apart, different
 * display fonts, and a different layout or surface style. A look also may not
 * be one of the old defaults with its exact accent and display face.
 */
export function lookDifferenceViolations(looks: readonly StudioLook[]): LookDifferenceViolation[] {
  const violations: LookDifferenceViolation[] = [];
  for (let i = 0; i < looks.length; i += 1) {
    for (let j = i + 1; j < looks.length; j += 1) {
      const a = looks[i]!;
      const b = looks[j]!;
      const pair: [string, string] = [a.id, b.id];
      const accents = accentsClose(a.theme.palette.accent, b.theme.palette.accent);
      if (accents) violations.push({ looks: pair, rule: "accent-hue", detail: accents });
      if (a.theme.fonts.display.toLowerCase() === b.theme.fonts.display.toLowerCase()) {
        violations.push({ looks: pair, rule: "display-font", detail: `both use ${a.theme.fonts.display}` });
      }
      const layoutDiffers =
        a.theme.layout.shell !== b.theme.layout.shell || a.theme.layout.width !== b.theme.layout.width;
      const surfaceDiffers =
        a.scheme !== b.scheme ||
        radiusShape(a.theme.radius) !== radiusShape(b.theme.radius) ||
        a.theme.imagery.treatment !== b.theme.imagery.treatment;
      if (!layoutDiffers && !surfaceDiffers) {
        violations.push({ looks: pair, rule: "layout-or-surface", detail: "same layout and surface style" });
      }
    }
  }
  if (looks.every((look) => look.source === "generated")) {
    for (const look of looks) {
      for (const seed of STUDIO_LOOK_SEEDS) {
        const values = DIRECTION_SEEDS[seed];
        const sameFace = values.typography.displayFamily?.includes(`"${look.theme.fonts.display}"`) ?? false;
        const sameAccent = hexToOklch(values.colors.accent);
        const accent = hexToOklch(look.theme.palette.accent);
        const nearAccent =
          hueDistance(sameAccent.h, accent.h) < 12 && Math.abs(sameAccent.c - accent.c) < 0.04;
        if (sameFace && nearAccent) {
          violations.push({ looks: [look.id, seed], rule: "copies-default", detail: `the ${seed} default's accent and face` });
        }
      }
    }
  }
  return violations;
}

/** A new look must differ from each look already shown on at least this many of layout, scheme, density, imagery. */
export const MIN_STRUCTURAL_CHANGES = 2;

/**
 * "Show me different ones" must not re-skin the set already shown: each new
 * look differs from every previous look on layout (frame or width), light or
 * dark, density or imagery, at least two of them, not only colour and type.
 */
export function lookRepeatsPrevious(look: StudioLook, previous: readonly StudioLook[]): { previous: StudioLook; same: string[] } | null {
  for (const earlier of previous) {
    const same = [
      look.theme.layout.shell === earlier.theme.layout.shell && look.theme.layout.width === earlier.theme.layout.width
        ? "layout"
        : null,
      look.scheme === earlier.scheme ? `${look.scheme} theme` : null,
      look.theme.density === earlier.theme.density ? "density" : null,
      look.theme.imagery.treatment === earlier.theme.imagery.treatment ? "imagery" : null,
    ].filter((axis): axis is string => axis !== null);
    if (4 - same.length < MIN_STRUCTURAL_CHANGES) return { previous: earlier, same };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Fallback: the three defaults, reinterpreted with the app's brief.

type SeedStance = {
  name: string;
  summary: (audience: string) => string;
  moodWords: string[];
  mood: StudioLookTheme["mood"];
  /** Accent hue band (degrees); the three bands keep every pair ≥ 60° apart. */
  hue: [number, number];
  chroma: number;
  lightness: number;
  scheme: StudioLook["scheme"];
  pairs: Array<[display: string, body: string]>;
  radius: number;
  density: StudioLookTheme["density"];
  layout: StudioLookTheme["layout"];
  imagery: StudioLookTheme["imagery"];
  headingWeight: number;
  ratio: number;
};

const SEED_STANCES: Record<(typeof STUDIO_LOOK_SEEDS)[number], SeedStance> = {
  "calm-ops": {
    name: "Calm and clear",
    summary: (audience) => `Quiet, tidy screens that keep ${audience} focused on the work.`,
    moodWords: ["calm", "clear", "focused"],
    mood: "calm",
    hue: [190, 220],
    chroma: 0.11,
    lightness: 0.56,
    scheme: "light",
    pairs: [
      ["Manrope", "Inter"],
      ["Schibsted Grotesk", "Public Sans"],
      ["Instrument Sans", "Source Sans 3"],
    ],
    radius: 8,
    density: "comfortable",
    layout: { shell: "rail", width: "standard", headerSearch: false },
    imagery: { treatment: "natural", halftone: false, grain: false },
    headingWeight: 600,
    ratio: 1.2,
  },
  "warm-craft": {
    name: "Warm and personal",
    summary: (audience) => `Soft, inviting pages with a human voice for ${audience}.`,
    moodWords: ["warm", "personal", "crafted"],
    mood: "playful",
    hue: [55, 80],
    chroma: 0.12,
    lightness: 0.62,
    scheme: "light",
    pairs: [
      ["Newsreader", "Figtree"],
      ["Lora", "DM Sans"],
      ["Young Serif", "Nunito Sans"],
    ],
    radius: 16,
    density: "spacious",
    layout: { shell: "masthead", width: "reading", headerSearch: false },
    imagery: { treatment: "tint", halftone: false, grain: true },
    headingWeight: 400,
    ratio: 1.25,
  },
  "bold-signal": {
    name: "Bold and bright",
    summary: (audience) => `Strong contrast and a confident colour that gets ${audience} moving.`,
    moodWords: ["bold", "confident", "energetic"],
    mood: "bold",
    hue: [330, 355],
    chroma: 0.19,
    lightness: 0.58,
    scheme: "dark",
    pairs: [
      ["Bricolage Grotesque", "Inter Tight"],
      ["Unbounded", "Hanken Grotesk"],
      ["Archivo", "Work Sans"],
    ],
    radius: 2,
    density: "compact",
    layout: { shell: "rail", width: "wide", headerSearch: false },
    imagery: { treatment: "duotone", halftone: true, grain: false },
    headingWeight: 700,
    ratio: 1.3,
  },
};

/**
 * Model text over a display or storage cap is cut at a word boundary with an
 * ellipsis, never refused: a long phrase must not stop a reference or a look.
 * `onClip` hears about every cut (the server logs it).
 */
export function clipText(text: string, max: number, onClip?: (full: string) => void): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  onClip?.(trimmed);
  const cut = trimmed.slice(0, max - 1);
  const atWord = cut.lastIndexOf(" ");
  return `${(atWord > max * 0.6 ? cut.slice(0, atWord) : cut).replace(/[\s,;:.\-–—]+$/, "")}…`;
}

const DENSITIES = ["compact", "comfortable", "spacious"] as const;
const TREATMENTS = ["natural", "tint", "duotone", "mono"] as const;

type Structure = {
  scheme: SeedStance["scheme"];
  shell: SeedStance["layout"]["shell"];
  width: SeedStance["layout"]["width"];
  density: SeedStance["density"];
  treatment: SeedStance["imagery"]["treatment"];
};

/** How many of layout, light or dark, density and imagery two looks differ on (lookRepeatsPrevious counts the same). */
function structuralChanges(a: Structure, b: Structure): number {
  return (
    Number(a.shell !== b.shell || a.width !== b.width) +
    Number(a.scheme !== b.scheme) +
    Number(a.density !== b.density) +
    Number(a.treatment !== b.treatment)
  );
}

const fallbackStructures: Structure[][] = [];

/**
 * The structure of each fallback look at a variant. Variant 0 is the defaults'
 * own; each later one picks, per look (its width stays), the scheme, frame,
 * density and imagery that differ most from every look of the variant before
 * and from the looks already picked for the set, so a set is never all one
 * theme with one density. Deterministic, so a set can be redrawn as it was.
 */
function fallbackStructuresAt(variant: number): Structure[] {
  if (!fallbackStructures.length) {
    fallbackStructures.push(
      STUDIO_LOOK_SEEDS.map((seed) => {
        const stance = SEED_STANCES[seed];
        return {
          scheme: stance.scheme,
          shell: stance.layout.shell,
          width: stance.layout.width,
          density: stance.density,
          treatment: stance.imagery.treatment,
        };
      }),
    );
  }
  while (fallbackStructures.length <= variant) {
    const previous = fallbackStructures[fallbackStructures.length - 1]!;
    const round = fallbackStructures.length;
    const chosen: Structure[] = [];
    fallbackStructures.push(
      previous.map((own, index) => {
        const candidates = (["light", "dark"] as const).flatMap((scheme) =>
          (["rail", "masthead"] as const).flatMap((shell) =>
            DENSITIES.flatMap((density) =>
              TREATMENTS.map((treatment): Structure => ({ scheme, shell, width: own.width, density, treatment })),
            ),
          ),
        );
        // Rotate the starting point so ties fall differently each round and for each look.
        const offset = (round * 7 + index * 5) % candidates.length;
        const ordered = [...candidates.slice(offset), ...candidates.slice(0, offset)];
        let best = ordered[0]!;
        let bestScore = -1;
        for (const candidate of ordered) {
          // Apart from every look shown before, and from the looks already picked for this set.
          const score = Math.min(...[...previous, ...chosen].map((other) => structuralChanges(candidate, other)));
          if (score > bestScore) {
            best = candidate;
            bestScore = score;
          }
        }
        chosen.push(best);
        return best;
      }),
    );
  }
  return fallbackStructures[variant]!;
}

/** A default's stance with the structure of its variant. */
function varyStance(stance: SeedStance, variant: number, index: number): SeedStance {
  if (variant === 0) return stance;
  const structure = fallbackStructuresAt(variant)[index]!;
  return {
    ...stance,
    scheme: structure.scheme,
    layout: { ...stance.layout, shell: structure.shell },
    density: structure.density,
    imagery: { ...stance.imagery, treatment: structure.treatment },
  };
}

/** FNV-1a, so ids and picks are stable for the same input on server and client. */
export function stableHash(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function lookId(theme: StudioLookTheme, scheme: string): string {
  return `look-${stableHash(JSON.stringify({ theme, scheme })).toString(36)}`;
}

/** Fill the theme's defaults and give the look its stable id. */
export function finishStudioLook(input: Omit<StudioLook, "id" | "theme"> & { theme: unknown }): StudioLook {
  const theme = studioLookThemeSchema.parse(input.theme);
  return studioLookSchema.parse({ ...input, theme, id: lookId(theme, input.scheme) });
}

/**
 * The three defaults as looks for this app: each keeps its stance, and the
 * brief picks its accent within the default's hue band and one of its font
 * pairs, so two apps on the fallback still differ.
 */
export function fallbackStudioLooks(
  identity: Pick<StudioIdentity, "summary" | "audience">,
  /** 0 for the first set; each "Show me different ones" on the fallback draws the next. */
  variant = 0,
): StudioLook[] {
  const audience = identity.audience.trim().replace(/[.!]+$/, "") || "people using it";
  return STUDIO_LOOK_SEEDS.map((seed, index) => {
    const stance = varyStance(SEED_STANCES[seed], variant, index);
    const pick = stableHash(`${seed}:${identity.summary}:${identity.audience}${variant ? `:${variant}` : ""}`);
    const [low, high] = stance.hue;
    const hue = low + (pick % 1000) / 1000 * (high - low);
    const [display, body] = stance.pairs[pick % stance.pairs.length]!;
    let lightness = stance.lightness;
    let accent = oklchToHex({ l: lightness, c: stance.chroma, h: hue });
    // A mid-tone takes neither black nor white text; darken until white reads.
    while (accentTextContrast(accent) < MIN_ACCENT_TEXT_CONTRAST && lightness > 0.3) {
      lightness -= 0.01;
      accent = oklchToHex({ l: lightness, c: stance.chroma, h: hue });
    }
    const neutral = oklchToHex({ l: 0.55, c: 0.012, h: hue });
    return finishStudioLook({
      name: stance.name,
      summary: stance.summary(audience),
      moodWords: stance.moodWords,
      scheme: stance.scheme,
      source: "fallback",
      fallbackSeed: seed,
      ...(variant ? { variant } : {}),
      theme: {
        mood: stance.mood,
        palette: { accent, neutral },
        fonts: { display, body },
        radius: stance.radius,
        density: stance.density,
        type: {
          headingWeight: Math.min(stance.headingWeight, STUDIO_LOOK_FONTS[display]?.maxWeight ?? 900),
          ratio: stance.ratio,
        },
        layout: stance.layout,
        imagery: stance.imagery,
      },
    });
  });
}

// ---------------------------------------------------------------------------
// From a look to the Studio's preview tokens and to the build's look.json.

export function fontStack(family: string): string {
  const category = STUDIO_LOOK_FONTS[family]?.category ?? "sans";
  return `"${family}", ${FALLBACK_STACKS[category]}`;
}

/** The family name a CSS stack starts with, when it is one the catalog knows. */
export function catalogFontFromStack(stack: string | undefined): string | null {
  const first = stack?.split(",")[0]?.trim().replace(/^["']|["']$/g, "");
  return first && first in STUDIO_LOOK_FONTS ? first : null;
}

/** The Google Fonts stylesheet for catalog faces, for the Studio's look cards and preview frame. */
export function googleFontsHref(families: readonly string[]): string {
  const query = [...new Set(families)]
    .filter((family) => family in STUDIO_LOOK_FONTS)
    .map((family) => `family=${family.replaceAll(" ", "+")}`);
  return `https://fonts.googleapis.com/css2?${query.join("&")}&display=swap`;
}

function shade(base: Oklch, l: number, maxChroma: number): string {
  return oklchToHex({ l, c: Math.min(base.c, maxChroma), h: base.h });
}

/** The legacy direction family a look stands closest to, for consumers that still read it. */
export function directionFamilyForLook(look: Pick<StudioLook, "theme" | "fallbackSeed">): DesignDirectionId {
  if (look.fallbackSeed) return look.fallbackSeed;
  return look.theme.mood === "calm" ? "calm-ops" : look.theme.mood === "bold" ? "bold-signal" : "warm-craft";
}

/**
 * The Studio's preview tokens for a look. Surfaces are tinted from the look's
 * neutral, never taken from a default; the founder's pins win.
 */
export function tokensFromLook(look: StudioLook, pins: DesignPins = {}): DesignTokens {
  const scheme = pins.scheme ?? look.scheme;
  const accent = pins.accent ?? look.theme.palette.accent;
  const neutral = hexToOklch(look.theme.palette.neutral);
  const tint = { ...neutral, c: Math.min(neutral.c, 0.03) };
  const dark = scheme === "dark";
  const colors = dark
    ? {
        background: shade(tint, 0.17, 0.02),
        foreground: shade(tint, 0.95, 0.01),
        surface: shade(tint, 0.21, 0.02),
        surfaceMuted: shade(tint, 0.25, 0.02),
        border: shade(tint, 0.33, 0.02),
        muted: shade(tint, 0.74, 0.015),
      }
    : {
        background: shade(tint, 0.975, 0.012),
        foreground: shade(tint, 0.2, 0.02),
        surface: shade(tint, 0.995, 0.006),
        surfaceMuted: shade(tint, 0.94, 0.015),
        border: shade(tint, 0.87, 0.015),
        muted: shade(tint, 0.47, 0.02),
      };
  const density = pins.density ?? look.theme.density;
  const radius = look.theme.radius;
  return designTokensSchema.parse({
    directionId: directionFamilyForLook(look),
    lookId: look.id,
    pins,
    colors: {
      ...colors,
      accent,
      accentForeground: readableOn(accent),
      secondary: shade(tint, 0.55, 0.03),
      focusRing: accent,
    },
    typography: {
      fontFamily: pins.typeFamily ?? fontStack(look.theme.fonts.body),
      displayFamily: pins.typeFamily ?? fontStack(look.theme.fonts.display),
      scaleRatio: look.theme.type.ratio,
      baseSizePx: look.theme.type.base,
    },
    space: { density, unit: DENSITY_SPACE_UNIT[density] },
    radius: {
      sm: Math.round(radius * 0.6),
      md: radius,
      lg: Math.min(look.theme.radiusMax ?? Math.round(radius * 1.6), 48),
    },
  });
}

export type StudioLookReferenceTraits = {
  kind: "url" | "image";
  label: string;
  traits: Record<string, string>;
};

/**
 * The founder's pinned face becomes the display face. When it is the body's
 * family, the look's display face reads the body instead (a headline-only
 * display face cannot, so the body stays and the pin is the display).
 */
function fontsWithPin(fonts: StudioLookTheme["fonts"], pinned: string | null): StudioLookTheme["fonts"] {
  if (!pinned || pinned === fonts.display) return fonts;
  const sameFamily = (a: string, b: string) => a.startsWith(b) || b.startsWith(a);
  if (!sameFamily(pinned, fonts.body)) return { ...fonts, display: pinned };
  if (!STUDIO_LOOK_FONTS[fonts.display]?.displayOnly && !sameFamily(pinned, fonts.display)) {
    return { ...fonts, display: pinned, body: fonts.display };
  }
  return fonts;
}

/**
 * design/look.json, the chosen look as the build reads it (STUDIO-LOOKS slice
 * L3): the template theme under `theme`, ready to become design/theme.json,
 * with the founder's pins applied, and why the look was chosen beside it.
 */
export function studioLookFile(input: {
  look: StudioLook;
  identity: StudioIdentity | null;
  pins: DesignPins;
  generatedAt: string;
  references?: StudioLookReferenceTraits[];
}): Record<string, unknown> {
  const { look, pins } = input;
  const theme = studioLookThemeSchema.parse({
    ...look.theme,
    palette: { ...look.theme.palette, ...(pins.accent ? { accent: pins.accent.toLowerCase() } : {}) },
    fonts: fontsWithPin(look.theme.fonts, catalogFontFromStack(pins.typeFamily)),
    ...(pins.density ? { density: pins.density } : {}),
  });
  return {
    lookId: look.id,
    name: look.name,
    generatedAt: input.generatedAt,
    source: look.source,
    ...(look.fallbackSeed ? { fallbackSeed: look.fallbackSeed } : {}),
    identity: {
      summary: input.identity?.summary ?? look.summary,
      moodWords: input.identity?.moodWords ?? look.moodWords,
      ...(input.identity?.audience ? { audience: input.identity.audience } : {}),
    },
    ...(input.references?.length ? { references: input.references } : {}),
    ...(Object.keys(pins).length ? { pins } : {}),
    scheme: pins.scheme ?? look.scheme,
    theme: { name: look.name, ...theme },
  };
}

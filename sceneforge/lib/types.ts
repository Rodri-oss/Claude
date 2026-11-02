/**
 * Shared domain types and Zod schemas. These are the typed interfaces modules use to talk to each other.
 * Keep this file free of Node-only imports: it is also used by the Remotion composition and the browser.
 */
import { z } from 'zod';

export const GENRES = [
  'anime-action',
  'comedy',
  'horror',
  'historical',
  'educational',
  'mystery',
  'scifi',
  'adventure',
  'slice-of-life',
  'custom',
] as const;
export type Genre = (typeof GENRES)[number];

export const ASPECTS = { '16:9': { width: 1920, height: 1080 }, '9:16': { width: 1080, height: 1920 } } as const;
export type Aspect = keyof typeof ASPECTS;

export const WORKFLOW_STAGES = [
  'idea',
  'script',
  'breakdown',
  'characters',
  'storyboard',
  'audio',
  'animation',
  'timeline',
  'review',
  'export',
] as const;
export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];

export const CHECKPOINTS = ['story', 'art', 'storyboard', 'generation', 'final'] as const;
export type Checkpoint = (typeof CHECKPOINTS)[number];

/** Animation modes. A = limited 2D, B = AI image-to-video, C = still image + camera. Hybrid = per-shot mix. */
export const SHOT_MODES = ['A', 'B', 'C'] as const;
export type ShotMode = (typeof SHOT_MODES)[number];

export const MixRatios = z.object({ A: z.number().min(0).max(1), B: z.number().min(0).max(1), C: z.number().min(0).max(1) });
export type MixRatios = z.infer<typeof MixRatios>;
export const DEFAULT_MIX: MixRatios = { A: 0.6, B: 0.3, C: 0.1 };

export const FRAMINGS = ['wide', 'medium', 'closeup', 'extreme-closeup', 'establishing'] as const;
export type Framing = (typeof FRAMINGS)[number];
export const CAMERA_MOVES = ['static', 'pan-left', 'pan-right', 'push-in', 'pull-out', 'tilt-up', 'tilt-down', 'shake'] as const;
export type CameraMove = (typeof CAMERA_MOVES)[number];
export const WEATHER = ['none', 'rain', 'snow', 'dust', 'fireflies', 'sparkles', 'embers'] as const;
export type Weather = (typeof WEATHER)[number];
export const TRANSITIONS = ['cut', 'fade', 'crossfade', 'wipe', 'flash'] as const;
export type TransitionType = (typeof TRANSITIONS)[number];
export const EXPRESSIONS = ['neutral', 'happy', 'angry', 'sad', 'surprised', 'worried'] as const;
export type Expression = (typeof EXPRESSIONS)[number];

export const ShotCharacter = z.object({
  characterId: z.string(),
  pose: z.string().default('idle'),
  expression: z.string().default('neutral'),
  /** horizontal position of the character's center, 0..1 of frame width */
  x: z.number().min(-0.5).max(1.5),
  flip: z.boolean().default(false),
  /** optional entrance / movement */
  enterFrom: z.enum(['none', 'left', 'right']).default('none'),
  moveToX: z.number().min(-0.5).max(1.5).nullable().default(null),
  /** expression change at a fraction of the shot */
  expressionChange: z.object({ at: z.number().min(0).max(1), expression: z.string() }).nullable().default(null),
});
export type ShotCharacter = z.infer<typeof ShotCharacter>;

export const ShotEffects = z.object({
  weather: z.enum(WEATHER).default('none'),
  /** CSS colour for a lighting/colour-grade overlay */
  tint: z.string().nullable().default(null),
  tintOpacity: z.number().min(0).max(1).default(0),
  vignette: z.number().min(0).max(1).default(0.25),
  /** impact flashes + screen shake at fractions of the shot */
  impacts: z.array(z.number().min(0).max(1)).default([]),
  speedLines: z.boolean().default(false),
});
export type ShotEffects = z.infer<typeof ShotEffects>;

export const ShotCamera = z.object({
  framing: z.enum(FRAMINGS).default('medium'),
  move: z.enum(CAMERA_MOVES).default('static'),
  /** focus point 0..1 horizontally — closeups centre on this */
  focusX: z.number().min(0).max(1).default(0.5),
  intensity: z.number().min(0).max(2).default(1),
});
export type ShotCamera = z.infer<typeof ShotCamera>;

export const GenerationSettings = z.object({
  durationSec: z.number().optional(),
  resolution: z.string().optional(),
  seed: z.number().int().optional(),
  quality: z.enum(['draft', 'final']).default('draft'),
  mockScenario: z.string().optional(),
});
export type GenerationSettings = z.infer<typeof GenerationSettings>;

/**
 * Character sprite rig. All layers are same-size transparent PNG/WebP images that stack exactly.
 * Imported single-image artwork just provides `poses.idle` (blink/mouth are then disabled).
 * This is limited animation (layer swapping), NOT skeletal rigging.
 */
export const SpriteRig = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  poses: z.record(z.string(), z.string()), // pose name -> assetId
  faces: z.record(z.string(), z.string()).default({}), // expression -> assetId (eyes+brows layer)
  eyesClosed: z.string().nullable().default(null),
  mouths: z
    .object({ closed: z.string(), open: z.string(), wide: z.string() })
    .nullable()
    .default(null),
});
export type SpriteRig = z.infer<typeof SpriteRig>;

// ---------------------------------------------------------------------------------------------
// Timeline: the single source of truth for preview + export. All times are integer frames.
// Media sources are relative storage paths; the renderer prefixes `mediaBase`.
// ---------------------------------------------------------------------------------------------

export type MouthShape = 0 | 1 | 2; // closed, open, wide

export interface TLCharacter {
  characterId: string;
  name: string;
  width: number;
  height: number;
  body: string;
  face: string | null;
  faceChange: { frame: number; face: string | null } | null;
  eyesClosed: string | null;
  mouths: [string, string, string] | null;
  /** x center (0..1 of stage width), stage positions are in "world" space affected by the camera */
  x: number;
  moveToX: number | null;
  enterFrom: 'none' | 'left' | 'right';
  /** bottom of sprite as fraction of frame height (can exceed 1 for medium/closeups) */
  footY: number;
  /** sprite height as fraction of frame height */
  heightFrac: number;
  flip: boolean;
  blinkSeed: number;
  /** compact mouth cue string, one char per frame relative to clip start ('0','1','2'); empty = closed */
  mouthCues: string;
}

export interface TLCameraKey {
  x: number; // world offset in frame widths (−0.1..0.1 typical)
  y: number;
  zoom: number;
}

export interface TLClip {
  id: string;
  shotId: string;
  sceneId: string;
  sceneIndex: number;
  label: string;
  mode: ShotMode;
  startFrame: number;
  durationInFrames: number;
  transitionIn: { type: TransitionType; frames: number };
  /** environment layers back→front; `front` layers (foreground/overlay) render above characters */
  background: { src: string; parallax: number; front: boolean }[];
  backgroundColor: string;
  camera: { from: TLCameraKey; to: TLCameraKey; shakeFrames: number[]; intensity: number };
  characters: TLCharacter[];
  video: { src: string; trimStartFrames: number; sourceFrames: number; mock: boolean } | null;
  still: { src: string } | null;
  effects: ShotEffects;
  /** Watermark text shown on mock-provider output so mock footage is never mistaken for real AI output */
  badge: string | null;
}

export type AudioTrackKind = 'dialogue' | 'music' | 'sfx' | 'ambience';

export interface TLAudioClip {
  id: string;
  track: AudioTrackKind;
  src: string;
  startFrame: number;
  durationInFrames: number;
  trimStartFrames: number;
  volume: number;
  fadeInFrames: number;
  fadeOutFrames: number;
  loop: boolean;
  label: string;
  dialogueLineId?: string;
}

export interface TLSubtitle {
  startFrame: number;
  endFrame: number;
  speaker: string | null;
  text: string;
}

export interface TrackSettings {
  dialogue: { volume: number; muted: boolean };
  music: { volume: number; muted: boolean; duckUnderDialogue: boolean; duckAmountDb: number };
  sfx: { volume: number; muted: boolean };
  ambience: { volume: number; muted: boolean };
  burnInSubtitles: boolean;
}

export const DEFAULT_TRACK_SETTINGS: TrackSettings = {
  dialogue: { volume: 1, muted: false },
  music: { volume: 0.55, muted: false, duckUnderDialogue: true, duckAmountDb: 10 },
  sfx: { volume: 0.8, muted: false },
  ambience: { volume: 0.5, muted: false },
  burnInSubtitles: true,
};

export interface Timeline {
  schema: 1;
  projectId: string;
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  clips: TLClip[];
  audio: TLAudioClip[];
  subtitles: TLSubtitle[];
  tracks: TrackSettings;
  scenes: { sceneId: string; index: number; title: string; startFrame: number; endFrame: number }[];
}

export interface CompositionProps {
  timeline: Timeline;
  mediaBase: string;
  [key: string]: unknown;
}

// Job states
export const JOB_STATES = [
  'DRAFT',
  'AWAITING_APPROVAL',
  'QUEUED',
  'SUBMITTED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'NEEDS_RECONCILIATION',
] as const;
export type JobState = (typeof JOB_STATES)[number];
export const TERMINAL_JOB_STATES: JobState[] = ['COMPLETED', 'FAILED', 'CANCELLED'];

export const JOB_KINDS = ['image', 'video', 'tts', 'render_preview', 'export', 'storyboard_frames'] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export const BUDGET_CATEGORIES = ['video', 'image', 'audio', 'revision', 'llm'] as const;
export type BudgetCategory = (typeof BUDGET_CATEGORIES)[number];

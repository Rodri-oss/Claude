import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type {
  MixRatios,
  ShotCamera,
  ShotCharacter,
  ShotEffects,
  GenerationSettings,
  SpriteRig,
  Timeline,
  JobState,
  TrackSettings,
} from '../types';

const now = () => new Date().toISOString();
const createdAt = () => text('created_at').notNull().$defaultFn(now);
const updatedAt = () => text('updated_at').notNull().$defaultFn(now);

export const series = sqliteTable('series', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  createdAt: createdAt(),
});

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  genre: text('genre').notNull(),
  preset: text('preset').notNull(),
  audience: text('audience').notNull().default('General'),
  logline: text('logline').notNull().default(''),
  synopsis: text('synopsis').notNull().default(''),
  sourceInput: text('source_input').notNull().default(''),
  sourceKind: text('source_kind').notNull().default('idea'), // idea | outline | script
  productionStyle: text('production_style').notNull().default('dialogue-first'), // narration-first | dialogue-first
  targetDurationSec: integer('target_duration_sec').notNull().default(120),
  aspect: text('aspect').notNull().default('16:9'),
  width: integer('width').notNull().default(1920),
  height: integer('height').notNull().default(1080),
  fps: integer('fps').notNull().default(24),
  stage: text('stage').notNull().default('idea'),
  mix: text('mix', { mode: 'json' }).$type<MixRatios>().notNull(),
  budgetLimitUsd: real('budget_limit_usd').notNull().default(80),
  isTemplate: integer('is_template', { mode: 'boolean' }).notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const episodes = sqliteTable(
  'episodes',
  {
    id: text('id').primaryKey(),
    seriesId: text('series_id').notNull().references(() => series.id, { onDelete: 'cascade' }),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('episodes_project_uq').on(t.projectId), uniqueIndex('episodes_series_num_uq').on(t.seriesId, t.number)],
);

export const styleBibles = sqliteTable('style_bibles', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().unique().references(() => projects.id, { onDelete: 'cascade' }),
  artStyle: text('art_style').notNull(),
  palette: text('palette', { mode: 'json' }).$type<string[]>().notNull(),
  lineWork: text('line_work').notNull().default(''),
  lighting: text('lighting').notNull().default(''),
  cameraLanguage: text('camera_language').notNull().default(''),
  notes: text('notes').notNull().default(''),
  locked: integer('locked', { mode: 'boolean' }).notNull().default(false),
  updatedAt: updatedAt(),
});

export const characters = sqliteTable('characters', {
  id: text('id').primaryKey(),
  seriesId: text('series_id').references(() => series.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  personality: text('personality').notNull().default(''),
  palette: text('palette', { mode: 'json' }).$type<string[]>().notNull(),
  proportions: text('proportions').notNull().default(''),
  identifyingDetails: text('identifying_details').notNull().default(''),
  voiceProvider: text('voice_provider').notNull().default('auto'),
  voiceId: text('voice_id').notNull().default(''),
  voiceSettings: text('voice_settings', { mode: 'json' }).$type<{ speed?: number; pitch?: number; style?: string }>().notNull(),
  rig: text('rig', { mode: 'json' }).$type<SpriteRig | null>(),
  locked: integer('locked', { mode: 'boolean' }).notNull().default(false),
  continuity: text('continuity', { mode: 'json' }).$type<Record<string, boolean>>().notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const projectCharacters = sqliteTable(
  'project_characters',
  {
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    characterId: text('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('supporting'),
  },
  (t) => [uniqueIndex('project_characters_uq').on(t.projectId, t.characterId)],
);

/** Approved reference images, views, expressions, outfits, poses, mouth sprites… */
export const characterVariants = sqliteTable(
  'character_variants',
  {
    id: text('id').primaryKey(),
    characterId: text('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // view | expression | outfit | pose | mouth | eyes | reference | fullbody | sheet
    name: text('name').notNull(),
    assetId: text('asset_id').notNull().references(() => assets.id),
    approved: integer('approved', { mode: 'boolean' }).notNull().default(false),
    meta: text('meta', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('variants_char_idx').on(t.characterId)],
);

export const environments = sqliteTable('environments', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull().default('general'),
  description: text('description').notNull().default(''),
  timeOfDay: text('time_of_day').notNull().default('day'),
  variantOf: text('variant_of'),
  lighting: text('lighting', { mode: 'json' }).$type<{ tint: string | null; tintOpacity: number; ambience?: string }>().notNull(),
  cameraPresets: text('camera_presets', { mode: 'json' }).$type<string[]>().notNull(),
  backgroundColor: text('background_color').notNull().default('#1b1f2a'),
  locked: integer('locked', { mode: 'boolean' }).notNull().default(false),
  createdAt: createdAt(),
});

export const environmentLayers = sqliteTable('environment_layers', {
  id: text('id').primaryKey(),
  environmentId: text('environment_id').notNull().references(() => environments.id, { onDelete: 'cascade' }),
  assetId: text('asset_id').notNull().references(() => assets.id),
  role: text('role').notNull(), // background | midground | foreground | overlay
  order: integer('order').notNull(),
  parallax: real('parallax').notNull().default(0.5),
  /** true when produced by automatic segmentation — requires human review */
  needsReview: integer('needs_review', { mode: 'boolean' }).notNull().default(false),
});

export const assets = sqliteTable(
  'assets',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id'), // null = shared library
    kind: text('kind').notNull(), // image | video | audio | document
    category: text('category').notNull(), // character | background | prop | dialogue | music | sfx | ambience | video | still | render | export | reference
    name: text('name').notNull(),
    path: text('path').notNull(), // relative to data dir
    mime: text('mime').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: text('sha256').notNull(),
    width: integer('width'),
    height: integer('height'),
    durationSec: real('duration_sec'),
    version: integer('version').notNull().default(1),
    parentAssetId: text('parent_asset_id'),
    tags: text('tags', { mode: 'json' }).$type<string[]>().notNull(),
    provenance: text('provenance', { mode: 'json' })
      .$type<{ source: 'import' | 'mock' | 'provider' | 'local' | 'render' | 'demo'; provider?: string; model?: string; prompt?: string; jobId?: string; license?: string; note?: string }>()
      .notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('assets_project_idx').on(t.projectId), index('assets_category_idx').on(t.category)],
);

export const scenes = sqliteTable(
  'scenes',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    environmentId: text('environment_id').references(() => environments.id, { onDelete: 'set null' }),
    locationName: text('location_name').notNull().default(''),
    beatStart: text('beat_start').notNull().default(''),
    beatEnd: text('beat_end').notNull().default(''),
    tone: text('tone').notNull().default(''),
    estDurationSec: real('est_duration_sec').notNull().default(0),
    actions: text('actions', { mode: 'json' }).$type<string[]>().notNull(),
    requiredAssets: text('required_assets', { mode: 'json' }).$type<string[]>().notNull(),
    music: text('music').notNull().default(''),
    ambience: text('ambience').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [index('scenes_project_idx').on(t.projectId, t.seq)],
);

export const dialogueLines = sqliteTable(
  'dialogue_lines',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    sceneId: text('scene_id').notNull().references(() => scenes.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    characterId: text('character_id').references(() => characters.id, { onDelete: 'set null' }),
    speakerName: text('speaker_name').notNull(), // NARRATOR for narration
    text: text('text').notNull(),
    emotion: text('emotion').notNull().default('neutral'),
    speed: real('speed').notNull().default(1),
    pronunciation: text('pronunciation', { mode: 'json' }).$type<Record<string, string>>().notNull(),
    activeAudioId: text('active_audio_id'),
  },
  (t) => [index('dialogue_scene_idx').on(t.sceneId, t.seq)],
);

export const audioSegments = sqliteTable('audio_segments', {
  id: text('id').primaryKey(),
  dialogueLineId: text('dialogue_line_id').notNull().references(() => dialogueLines.id, { onDelete: 'cascade' }),
  assetId: text('asset_id').notNull().references(() => assets.id),
  provider: text('provider').notNull(),
  voiceId: text('voice_id').notNull().default(''),
  durationSec: real('duration_sec').notNull(),
  /** per-frame mouth cues at the project fps: '0' closed, '1' open, '2' wide */
  mouthCues: text('mouth_cues').notNull().default(''),
  cueFps: integer('cue_fps').notNull().default(24),
  textHash: text('text_hash').notNull(),
  version: integer('version').notNull().default(1),
  createdAt: createdAt(),
});

export const shots = sqliteTable(
  'shots',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    sceneId: text('scene_id').notNull().references(() => scenes.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    purpose: text('purpose').notNull().default(''),
    durationSec: real('duration_sec').notNull().default(5),
    dialogueLineIds: text('dialogue_line_ids', { mode: 'json' }).$type<string[]>().notNull(),
    characters: text('characters', { mode: 'json' }).$type<ShotCharacter[]>().notNull(),
    environmentId: text('environment_id'),
    camera: text('camera', { mode: 'json' }).$type<ShotCamera>().notNull(),
    effects: text('effects', { mode: 'json' }).$type<ShotEffects>().notNull(),
    transitionIn: text('transition_in').notNull().default('cut'),
    sfx: text('sfx', { mode: 'json' }).$type<{ assetId: string; at: number; volume: number }[]>().notNull(),
    references: text('references', { mode: 'json' }).$type<string[]>().notNull(),
    mode: text('mode').notNull().default('A'),
    imagePrompt: text('image_prompt').notNull().default(''),
    motionPrompt: text('motion_prompt').notNull().default(''),
    negativePrompt: text('negative_prompt').notNull().default(''),
    imageModel: text('image_model').notNull().default('mock/image'),
    videoModel: text('video_model').notNull().default('mock/image-to-video'),
    generation: text('generation', { mode: 'json' }).$type<GenerationSettings>().notNull(),
    approval: text('approval').notNull().default('pending'), // pending | approved | rejected
    estimatedCostUsd: real('estimated_cost_usd').notNull().default(0),
    actualCostUsd: real('actual_cost_usd').notNull().default(0),
    activeVersionId: text('active_version_id'),
    startImageVersionId: text('start_image_version_id'),
    thumbnailAssetId: text('thumbnail_asset_id'),
    trimStartSec: real('trim_start_sec').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('shots_project_idx').on(t.projectId, t.seq)],
);

/** Every generated/imported output for a shot. Approved versions are never deleted or overwritten. */
export const shotVersions = sqliteTable(
  'shot_versions',
  {
    id: text('id').primaryKey(),
    shotId: text('shot_id').notNull().references(() => shots.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    kind: text('kind').notNull(), // start_image | video | still
    assetId: text('asset_id').notNull().references(() => assets.id),
    jobId: text('job_id'),
    source: text('source').notNull(), // mock | provider | upload
    status: text('status').notNull().default('candidate'), // candidate | approved | rejected
    note: text('note').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('shot_versions_uq').on(t.shotId, t.kind, t.version)],
);

export const generationJobs = sqliteTable(
  'generation_jobs',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id'),
    shotId: text('shot_id'),
    sceneId: text('scene_id'),
    kind: text('kind').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    input: text('input', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    state: text('state').$type<JobState>().notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    isRevision: integer('is_revision', { mode: 'boolean' }).notNull().default(false),
    paid: integer('paid', { mode: 'boolean' }).notNull().default(false),
    simulatedCost: integer('simulated_cost', { mode: 'boolean' }).notNull().default(false),
    budgetCategory: text('budget_category').notNull().default('video'),
    estimatedCostUsd: real('estimated_cost_usd').notNull().default(0),
    actualCostUsd: real('actual_cost_usd'),
    approvalId: text('approval_id'),
    providerJobId: text('provider_job_id'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    progress: real('progress').notNull().default(0),
    message: text('message').notNull().default(''),
    error: text('error'),
    errorClass: text('error_class'),
    result: text('result', { mode: 'json' }).$type<Record<string, unknown> | null>(),
    lockedBy: text('locked_by'),
    lockedAt: text('locked_at'),
    nextRunAt: text('next_run_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('jobs_state_idx').on(t.state), index('jobs_idem_idx').on(t.idempotencyKey)],
);

export const generationAttempts = sqliteTable('generation_attempts', {
  id: text('id').primaryKey(),
  jobId: text('job_id').notNull().references(() => generationJobs.id, { onDelete: 'cascade' }),
  attemptNo: integer('attempt_no').notNull(),
  phase: text('phase').notNull(), // submitting | submitted | running | succeeded | failed | reconciled
  providerJobId: text('provider_job_id'),
  request: text('request', { mode: 'json' }).$type<Record<string, unknown>>(),
  response: text('response', { mode: 'json' }).$type<Record<string, unknown> | null>(),
  error: text('error'),
  errorClass: text('error_class'),
  startedAt: text('started_at').notNull().$defaultFn(now),
  finishedAt: text('finished_at'),
});

export const approvals = sqliteTable(
  'approvals',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    checkpoint: text('checkpoint').notNull(),
    decision: text('decision').notNull(), // approved | rejected | revoked
    /** hash of the approved content; if the content changes, the approval is stale */
    snapshotHash: text('snapshot_hash').notNull().default(''),
    scope: text('scope', { mode: 'json' }).$type<{ jobIds?: string[]; maxAmountUsd?: number; shotIds?: string[] }>().notNull(),
    amountUsd: real('amount_usd').notNull().default(0),
    note: text('note').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [index('approvals_project_idx').on(t.projectId, t.checkpoint)],
);

export const timelines = sqliteTable('timelines', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  data: text('data', { mode: 'json' }).$type<Timeline>().notNull(),
  hash: text('hash').notNull(),
  createdAt: createdAt(),
});

/** Per-project editor settings that feed timeline building (track levels, music, ambience choices). */
export const editorSettings = sqliteTable('editor_settings', {
  projectId: text('project_id').primaryKey().references(() => projects.id, { onDelete: 'cascade' }),
  tracks: text('tracks', { mode: 'json' }).$type<TrackSettings>().notNull(),
  musicAssetId: text('music_asset_id'),
  ambienceAssetId: text('ambience_asset_id'),
  musicFadeSec: real('music_fade_sec').notNull().default(2),
  transitionFrames: integer('transition_frames').notNull().default(12),
});

export const budgetSettings = sqliteTable('budget_settings', {
  id: integer('id').primaryKey(),
  monthlyLimitUsd: real('monthly_limit_usd').notNull().default(250),
  allocations: text('allocations', { mode: 'json' }).$type<Record<string, number>>().notNull(),
  warnThreshold: real('warn_threshold').notNull().default(0.8),
  defaultProjectLimitUsd: real('default_project_limit_usd').notNull().default(80),
  perSceneLimitUsd: real('per_scene_limit_usd').notNull().default(30),
  perShotLimitUsd: real('per_shot_limit_usd').notNull().default(8),
  maxGenerationsPerShot: integer('max_generations_per_shot').notNull().default(4),
  maxBatchUsd: real('max_batch_usd').notNull().default(40),
  reserveUsd: real('reserve_usd').notNull().default(15),
  killSwitch: integer('kill_switch', { mode: 'boolean' }).notNull().default(false),
  countSimulated: integer('count_simulated', { mode: 'boolean' }).notNull().default(true),
  updatedAt: updatedAt(),
});

export const budgetLedger = sqliteTable(
  'budget_ledger',
  {
    id: text('id').primaryKey(),
    month: text('month').notNull(), // YYYY-MM
    projectId: text('project_id'),
    sceneId: text('scene_id'),
    shotId: text('shot_id'),
    jobId: text('job_id'),
    category: text('category').notNull(),
    type: text('type').notNull(), // reservation | release | charge | adjustment
    amountUsd: real('amount_usd').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull().default(''),
    simulated: integer('simulated', { mode: 'boolean' }).notNull().default(false),
    note: text('note').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [index('ledger_month_idx').on(t.month), index('ledger_job_idx').on(t.jobId)],
);

export const exportsTable = sqliteTable('exports', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(), // final | preview
  status: text('status').notNull().default('pending'),
  jobId: text('job_id'),
  timelineId: text('timeline_id'),
  dir: text('dir'),
  videoPath: text('video_path'),
  srtPath: text('srt_path'),
  manifestPath: text('manifest_path'),
  sceneFiles: text('scene_files', { mode: 'json' }).$type<string[]>().notNull(),
  width: integer('width'),
  height: integer('height'),
  fps: integer('fps'),
  durationSec: real('duration_sec'),
  sizeBytes: integer('size_bytes'),
  validation: text('validation', { mode: 'json' }).$type<Record<string, unknown> | null>(),
  createdAt: createdAt(),
});

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).$type<unknown>().notNull(),
});

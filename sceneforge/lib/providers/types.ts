/**
 * Provider adapter contract. Every AI provider (mock, local, fal.ai, ElevenLabs, Runway…) implements this,
 * and the job processor only ever talks to this interface. Provider results are normalized into
 * NormalizedOutput before they touch the rest of the app.
 */

export type GenerationKind = 'image' | 'video' | 'tts';
export type GenerationMode = 'text-to-image' | 'reference-image' | 'image-edit' | 'image-to-video' | 'text-to-video' | 'tts';

export interface ModelPricing {
  unit: 'per_second' | 'per_image' | 'per_1k_chars' | 'per_video' | 'free';
  usd: number;
  /** where the price came from — simulated prices are labelled so; real ones must cite a verified source/date */
  source: string;
  simulated: boolean;
}

export interface ModelCapabilities {
  id: string; // "<provider>/<model>"
  provider: string;
  model: string;
  label: string;
  kind: GenerationKind;
  modes: GenerationMode[];
  durationSec?: { min: number; max: number; allowed?: number[] };
  resolutions: string[];
  aspectRatios: string[];
  maxReferenceImages: number;
  audio: boolean;
  lipSync: boolean;
  startEndFrames: boolean;
  negativePrompt: boolean;
  paid: boolean;
  /** true only when capabilities were checked against current official docs */
  verified: boolean;
  pricing: ModelPricing;
  notes: string;
  voices?: { id: string; label: string }[];
}

export interface GenerationRequest {
  kind: GenerationKind;
  modelId: string;
  idempotencyKey: string;
  prompt?: string;
  negativePrompt?: string;
  /** absolute path of the approved start image (image-to-video) */
  imagePath?: string;
  referenceImages?: string[];
  durationSec?: number;
  width: number;
  height: number;
  seed?: number;
  quality?: 'draft' | 'final';
  /** TTS */
  text?: string;
  voiceId?: string;
  emotion?: string;
  speed?: number;
  pitch?: number;
  pronunciation?: Record<string, string>;
  /** Mock-only deterministic scenario (success, fail-transient, fail-invalid, fail-ambiguous, fail-render, slow, expired-media) */
  mockScenario?: string;
  /** Mock image: keyframe composition spec for deterministic output */
  keyframe?: unknown;
}

export interface CostEstimate {
  usd: number;
  breakdown: string;
  simulated: boolean;
}

export interface SubmitResult {
  providerJobId: string;
}

export interface StatusResult {
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  progress?: number;
  error?: ProviderError;
}

export interface NormalizedFile {
  path: string; // absolute temp path; the job processor imports it into the asset store
  kind: 'image' | 'video' | 'audio';
  ext: string;
}

export interface NormalizedOutput {
  files: NormalizedFile[];
  actualCostUsd: number | null; // null → provider didn't report; we settle at the estimate and flag it
  costSource: 'provider' | 'estimate' | 'free';
  mock: boolean;
  meta: Record<string, unknown>;
}

export type ErrorClass =
  | 'transient' // safe to retry: we know nothing was billed (e.g. connection refused before submit, 5xx on submit with no job created)
  | 'rate_limited'
  | 'timeout'
  | 'invalid_input'
  | 'unsupported'
  | 'auth'
  | 'content_policy'
  | 'ambiguous' // request may have been accepted/billed — must reconcile before any retry
  | 'expired_media'
  | 'disk_space'
  | 'provider_failed'
  | 'not_configured'
  | 'unknown';

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly errorClass: ErrorClass,
    public readonly billed: 'no' | 'yes' | 'unknown' = 'unknown',
    public readonly retryAfterMs?: number,
  ) {
    super(message);
  }
  get retryable() {
    return (this.errorClass === 'transient' || this.errorClass === 'rate_limited' || this.errorClass === 'timeout' || this.errorClass === 'expired_media') && this.billed === 'no';
  }
}

export interface ProviderAdapter {
  id: string;
  label: string;
  paid: boolean;
  /** "implemented" adapters can run jobs; "planned" ones are architecture placeholders */
  availability: 'implemented' | 'planned';
  models(): ModelCapabilities[];
  isConfigured(): { ok: boolean; reason?: string };
  estimateCost(req: GenerationRequest): CostEstimate;
  submit(req: GenerationRequest): Promise<SubmitResult>;
  status(providerJobId: string): Promise<StatusResult>;
  result(providerJobId: string): Promise<NormalizedOutput>;
  /** Look up a job by idempotency key after an ambiguous failure. */
  reconcile?(idempotencyKey: string): Promise<{ found: boolean; providerJobId?: string }>;
  classifyError(e: unknown): ProviderError;
}

# Providers & API connections

## Adapter contract (`lib/providers/types.ts`)

Every provider implements `ProviderAdapter`:

| Member | Purpose |
|---|---|
| `id`, `label`, `paid`, `availability` | identity; `planned` adapters refuse all work |
| `models()` → `ModelCapabilities[]` | per model: kind, modes, duration range, resolutions/aspects, max reference images, audio, lip-sync, start/end frames, negative prompt, pricing (with source + `simulated` flag), `verified` flag, voices |
| `isConfigured()` | key present / binary installed |
| `estimateCost(req)` | `{usd, breakdown, simulated}` — must follow verified billing rules |
| `submit(req)` | returns provider job id; must be idempotent on `req.idempotencyKey` where the API allows |
| `status(id)` | queued / running / succeeded / failed (+ `ProviderError`) |
| `result(id)` | `NormalizedOutput` — local temp files + actual cost (or `null` → settled at estimate and flagged) |
| `reconcile(key)` | optional lookup after ambiguous failures |
| `classifyError(e)` | maps to `ErrorClass` + `billed: 'no' \| 'yes' \| 'unknown'` |

The queue only talks to this interface; results are imported through `importAsset()` with provenance.

## Implemented (Phase 1)

| Model id | What it really is | Cost |
|---|---|---|
| `mock/image` | sharp compositor of your approved character + environment assets, watermarked **MOCK IMAGE** | simulated $0.04/image |
| `mock/image-to-video` | FFmpeg camera drift over the approved start image, watermarked **MOCK AI VIDEO** | simulated $0.05/s draft, $0.12/s final |
| `mock/tts` | syllabic tone "babble" timed like speech — not intelligible | free |
| `local/espeak-ng` | real offline TTS (robotic); emotion approximated via speed/pitch/amplitude | free |

Simulated prices exist only to exercise the budget/approval flow; they are **not** real provider rates.
Mock scenarios for testing (shot editor → *Mock scenario*): `fail-transient`, `fail-ratelimit`, `fail-invalid`, `fail-ambiguous`, `fail-render`, `expired-media`, `slow`.

## Planned (Phase 2) — not implemented, not verified

`fal`, `elevenlabs` and `runway` are registered placeholders (visible in Settings) that expose no models and refuse to submit.
**Nothing about their current endpoints, model capabilities or prices has been verified in this build.**
Before enabling any of them, Phase 2 must:

1. Read the current official docs/SDK (fal.ai `@fal-ai/client`, ElevenLabs API, Runway API) and record the verification date in `ModelCapabilities.pricing.source`.
2. Confirm each candidate model's real capabilities (anime style quality, reference images, durations, start/end frames, audio, lip-sync) with a small *approved* test — don't assume.
   Candidates named in the brief: fal.ai image-to-video (MiniMax/Hailuo variants, Kling 2.5 Turbo Pro), fal.ai Instant Character / image-edit models for reference-conditioned character images; ElevenLabs TTS for voices.
3. Implement `estimateCost` from the verified billing rules, `reconcile` via the provider's request/status lookup, and webhook or polling status.
4. Add adapter tests using recorded fixtures (no live calls in CI).

## Connecting keys (when Phase 2 adapters exist)

Put keys in `sceneforge/.env.local` (never commit it):

```
FAL_KEY=...
ELEVENLABS_API_KEY=...
RUNWAY_API_KEY=...
SCENEFORGE_ALLOW_PAID_PROVIDERS=true   # master switch for any real charge
```

Restart web + worker after editing. Even with keys set, every paid job still needs: kill switch off, budget room under every cap, and an explicit Checkpoint-4 approval of that exact batch.

## Optional LLM story drafting

The story engine works without any key (script parser + deterministic template drafts). An LLM drafting adapter (e.g. Anthropic or another documented API) is a Phase 2 item; it should return a `StoryDraft` (Zod-validated in `lib/story/draft.ts`) and be billed under the `llm` budget category.

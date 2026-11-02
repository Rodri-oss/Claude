# Architecture

Two processes, one SQLite database, one data directory.

```
┌──────────────── Next.js 16 (app/) ────────────────┐        ┌──────── worker/index.ts ────────┐
│ Server components read lib/* directly             │        │ lane "generation": provider jobs │
│ Client components → POST /api/rpc/<action> (Zod)  │        │ lane "render": frames/previews/  │
│ /api/upload (streaming, size-limited, validated)  │        │                export            │
│ /api/media/* (read-only, Range, data dir only)    │        │ restart recovery, reconciliation │
│ @remotion/player preview (same composition)       │        └──────────────┬──────────────────┘
└──────────────────────┬────────────────────────────┘                       │
                       └──────── lib/ (typed domain modules) ───────────────┘
                                        │
                     data/sceneforge.db (WAL)  ·  data/projects  ·  data/shared-assets  ·  data/exports
```

No Redis, queues or microservices: the job queue is a SQLite table with leases. Everything is TypeScript.

## Modules (lib/)

| # | Module | Path | Responsibility |
|---|---|---|---|
| 1 | Web application | `app/`, `components/` | Pages, RPC/upload/media routes |
| 2 | Project & database | `lib/db/*`, `lib/story/service.ts` (projects) | Drizzle schema + migrations, project CRUD, series/episodes |
| 3 | Story & planning | `lib/story/*`, `lib/shots/service.ts` | Presets, template drafts, script parser, runtime estimates, scenes/dialogue, shot planner |
| 4 | Characters & assets | `lib/characters`, `lib/environments`, `lib/assets` | Library, variants, sprite rigs, locking, continuity, layered environments, validated asset storage with versions + provenance |
| 5 | AI provider adapters | `lib/providers/*` | `ProviderAdapter` contract, mock, local eSpeak, Phase-2 placeholders |
| 6 | Animation compositor | `remotion/*`, `lib/animation/*` | Remotion composition (limited animation), staging rules, sharp keyframe compositor |
| 7 | Audio engine | `lib/audio/*` | Dialogue TTS jobs, imported lines, mouth cues, synth, FFmpeg mix |
| 8 | Timeline & export | `lib/timeline/builder.ts`, `lib/rendering/*` | Frame-accurate timeline, Remotion render, mix, mux, validation, SRT, scene cuts, manifest |
| 9 | Job processor | `lib/jobs/*`, `worker/` | Durable queue, approvals, retries, reconciliation, recovery |
| 10 | Budget tracker | `lib/budget/service.ts` | Settings, caps, reservation ledger, summaries |
| — | Approvals | `lib/approvals/service.ts` | Checkpoints 1/2/3/5 (content-hash), stage derivation |

All modules communicate through the types in `lib/types.ts` (Zod schemas for shot camera/characters/effects, sprite rig, the `Timeline` model, job states) and `lib/providers/types.ts` (adapter contract). The RPC surface is `lib/api/actions.ts` — one Zod-validated handler per UI action.

## Approval checkpoints

`approvals` rows store a **snapshot hash** of the approved content:

| Checkpoint | Hash covers | Prerequisites |
|---|---|---|
| 1 story | scenes + dialogue | ≥ 1 scene |
| 2 art | cast rigs/lock state, scene environments + layers, Style Bible | story approved; every cast member has art and is locked; every scene has an environment |
| 3 storyboard | every shot's plan (duration, mode, camera, characters, prompts, lines, effects) | art approved; shots exist |
| 4 generation | not hashed — scoped to an explicit list of job ids + max amount | art + storyboard approved |
| 5 final | the exact timeline version hash | timeline built |

If the content changes after approval, the checkpoint becomes **stale** and downstream actions are blocked until re-approval. The project's stage is *derived* from approvals, never stored independently.

## Job state machine

```
DRAFT → AWAITING_APPROVAL → QUEUED → SUBMITTED → RUNNING → COMPLETED | FAILED | CANCELLED | NEEDS_RECONCILIATION
```

- Costed jobs start in `AWAITING_APPROVAL`. `approveJobs()` checks the batch cap, **reserves** each estimate (atomic `BEGIN IMMEDIATE`), records a generation approval whose scope lists the job ids, then queues them. A failed reservation rolls back the whole batch.
- At submission the worker re-checks approval scope + reservation (defence in depth), writes `SUBMITTED` + a `submitting` attempt **before** calling the provider, then stores the provider job id.
- Error classes (`ProviderError`): only `transient | rate_limited | timeout` with `billed: 'no'` are retried automatically (exponential backoff, same approval, max attempts). `ambiguous` or possibly-billed errors go to `NEEDS_RECONCILIATION` and are **never** auto-retried.
- Crash mid-submit → on restart the job is `SUBMITTED` with no provider id → `adapter.reconcile(idempotencyKey)` looks it up; found → resume polling, not found → safe resubmit.
- Finished-but-undownloadable results (`expired_media`) are re-fetched without resubmitting.
- Duplicate prevention: idempotency key = hash(kind, shot, model, request, variant). An identical request returns the existing job unless it failed/was cancelled; intentional variations pass a `variant`.
- Locks are leases (`lockedBy = host:pid`, 90 s). On start the worker releases locks of dead PIDs on its host, plus any expired lease.
- Outputs are written to temp files and moved into place atomically; imported assets are content-validated (sharp/ffprobe) and hashed.

## Timeline model (single source of truth)

`buildTimeline(projectId)` produces a `Timeline` (`lib/types.ts`) with integer frames only:

- Shot length = max(planned duration, lead + Σ actual dialogue audio durations + gaps + tail). Lines without audio fall back to estimates.
- Crossfade/wipe overlap the previous clip by the transition length; cut/fade/flash don't.
- Dialogue clips, subtitles and per-character **mouth cues** (one char per frame, from the audio amplitude envelope) are placed at the same frame offsets.
- Mode B uses the active video version (freeze-frame if shorter); missing AI footage falls back to limited animation with an on-screen label. Mock output is always labelled.
- Music/ambience beds: per-scene overrides or a project default, looped with fades.

Timelines are versioned (`timelines` table, hash-deduplicated). The same `Timeline` drives the browser preview (`@remotion/player`, audio played raw) and export (Remotion renders muted video; FFmpeg mixes audio with per-track volumes, fades, sidechain ducking under dialogue, limiter, then muxes and validates).

## Limited animation (Mode A) — what it is and isn't

Layer swapping and transforms: parallax camera pans/zooms/tilts, shakes, character entrances and moves with walk bob, idle breathing/sway, blinking, expression changes (mid-shot too), amplitude-driven mouth flaps (closed/open/wide), weather/particles, lighting tints, vignettes, impact flashes, speed lines, transitions. It is **not** skeletal rigging or phoneme-accurate lip-sync.

Sprite rig contract: all layers are same-size transparent PNG/WebP images that stack exactly — `poses[name]`, `faces[expression]` (eyes+brows), `eyesClosed`, `mouths{closed,open,wide}`. A single imported image works as a static pose.

## Data model

Tables (see `lib/db/schema.ts`): `series, projects, episodes, style_bibles, characters, project_characters, character_variants, environments, environment_layers, assets, scenes, dialogue_lines, audio_segments, shots, shot_versions, generation_jobs, generation_attempts, approvals, timelines, editor_settings, budget_settings, budget_ledger, exports, app_settings`.

Media layout:
```
data/
  sceneforge.db
  shared-assets/<category>/<assetId>-<name>      # library (characters, environments, music…)
  projects/<projectId>/assets/<category>/…       # generated/imported per-project media (never overwritten)
  exports/<projectId>/<exportId>/{final.mp4,final.srt,scene-NN.mp4,manifest.json}
  cache/bundle-<hash>/                            # Remotion bundle cache
  mock-provider/, local-provider/, tmp/, run/
```

## Security

- API keys only from server env vars; never sent to the client or logged (`environmentReport()` exposes booleans only).
- `/api/media` serves only `projects/`, `shared-assets/`, `exports/` with an extension allow-list; all paths go through `resolveDataPath()` (no traversal, no DB access).
- Uploads stream to temp files with a byte limit (`SCENEFORGE_MAX_UPLOAD_MB`), names are sanitized, contents verified (images by sharp, A/V by ffprobe, documents must be text).
- The render media server binds to `127.0.0.1` on a random port, read-only, data dir only.
- Real paid calls require `SCENEFORGE_ALLOW_PAID_PROVIDERS=true`, kill switch off, budget room, and an explicit batch approval.

## Extending to the cloud later

Replace `lib/db` (SQLite → Postgres via Drizzle), the data directory (→ object storage behind `resolveDataPath`/`importAsset`), and run more workers (leases already support it). The RPC, provider and timeline contracts don't change.

# Implementation status — Phase 1

Last verified: 2026-11-02 on Linux, Node 22.23, FFmpeg 6.1, Remotion 4.0.540, Next 16.4.4, 4 vCPU.

## Phase 1 acceptance test — PASSED

`npm run demo:seed && npm run demo:render` produced **The Lantern Courier** with **no paid API calls**:

- `final.mp4` — 1920×1080, H.264 yuv420p, AAC 48 kHz stereo, 24 fps, **128.3 s** (target 120 s, allowed range 120–300 s)
- 4 scenes / 28 shots; multiple environments with parallax camera moves, blinking, expression changes, amplitude-driven mouth flaps, character entrances/runs, weather (rain, dust, fireflies, sparkles), impact flashes, speed lines, fades/crossfades
- Dialogue voiced with local eSpeak NG (free), per-scene original music + ambience, SFX; FFmpeg mix with sidechain ducking + limiter
- Validation (ffprobe + full decode): codecs, resolution, fps, duration = timeline duration, decodable, no clipping (peak −2.4 dBFS), runtime in range
- Also exported: `final.srt`, `scene-01…04.mp4`, `manifest.json` (asset provenance, `containsMockContent: true`)
- Render time: 498 s for the full export job (434 s render + mix/validation/scene cuts) on 4 cores

I inspected the rendered frames: motion, lip flap across closed/open/wide shapes, blinks and subtitles are visibly present. Mode B shots in the demo are **mock** clips (FFmpeg camera drift over a composited still, watermarked "MOCK AI VIDEO") and must not be read as AI animation.

## What actually works

| Area | Status |
|---|---|
| Projects, genre presets, 16:9 / 9:16, 120–300 s target, per-project Style Bible | ✅ |
| Series & episodes, project templates (cast copy), shared Character Library | ✅ |
| Story: idea → deterministic template draft (no key), script parser/editor, file load, scene & line editing, runtime estimate | ✅ |
| Approval checkpoints 1–5 with content-hash staleness, stage derived from approvals | ✅ |
| Character Studio: variants (views, full-body, sheets, refs, outfits, poses, expressions, blink, mouths), approval, rig build with size validation, continuity checklist, design lock, voice assignment | ✅ |
| Environments: layered artwork with parallax, segmentation "needs review" flag, day/night lighting variants, lock | ✅ |
| Asset library: streaming size-limited upload, content validation, sha256, versions, provenance, search | ✅ |
| Shot planner (establishing/dialogue/action shots, framing, moves, effects, A/B/C by mix ratio) | ✅ |
| Shot controls: create / edit / duplicate / reorder (incl. across scenes) / approve / reject / regenerate / replace; per-shot version history with revert | ✅ |
| Limited 2D animation (Mode A) in Remotion | ✅ |
| Mode B pipeline (approved start image → image-to-video → takes) | ✅ with **mock** provider only |
| Mode C stills with camera moves | ✅ |
| Storyboard keyframes (sharp compositor) | ✅ |
| Dialogue TTS per line, regenerate single lines, import recordings, segment history, narrator voice | ✅ (eSpeak NG / mock) |
| Mouth cues from actual audio amplitude | ✅ (not phoneme lip-sync) |
| Durable job queue: approval gating, reservations, retries of safe failures, reconciliation, restart recovery, duplicate prevention, cancel | ✅ |
| Budget: monthly/project/scene/shot/generation-count/batch caps, revision reserve, kill switch, paid master switch, ledger, dashboard, simulated vs real | ✅ |
| Editor: Remotion Player preview, multi-track view, clip trim/duration/transition/reorder, track volume/mute/ducking, music/ambience, burn-in subtitles | ✅ (basic) |
| Export: final + previews (whole/per scene), H.264/AAC, SRT, scene files, manifest, validation | ✅ |
| Start/stop scripts, worker, DB migrations, demo seed/render | ✅ |
| Tests: 37 unit/integration + 1 e2e render (all passing) | ✅ |

## Mocked (never presented as real AI)

- `mock/image` — composites your approved assets; watermarked "MOCK IMAGE"
- `mock/image-to-video` — FFmpeg drift of a still; watermarked "MOCK AI VIDEO"
- `mock/tts` — tone babble (only used when eSpeak NG is not installed)
- Mock prices ($0.04/image, $0.05–0.12/s) are **simulated**, labelled as such in the UI and ledger

## Not implemented yet

- **Real providers (Phase 2):** fal.ai image/image-to-video, ElevenLabs TTS, Runway — placeholders only. Their endpoints, capabilities and prices have **not** been verified in this build.
- LLM-based story drafting (template + parser only)
- Automatic layer segmentation (manual layers + review flag only)
- Webhooks (polling only); automatic temp-file cleanup
- Drag-and-drop timeline editing (button-based reorder; numeric trims)
- Demo characters ship front views only (side/back/three-quarter slots are empty; upload supported)
- Authentication (single-user local app)

## Known limitations

- Limited animation is layer swapping + transforms, not skeletal rigging. Lip flap is amplitude-based, not phoneme-accurate.
- The browser preview plays raw audio tracks; ducking/limiting only apply in exports.
- The A/B/C mix ratio is approximated by shot duration when planning.
- Export speed: roughly 4–5× real time for 1080p on 4 cores (~9 min for 2 min of video).
- 9:16 staging is verified with storyboard keyframes; a full 9:16 export has not been rendered yet.
- Internal cost estimates may differ from provider invoices; reconcile against provider billing.
- `next build` prints file-tracing warnings (affect deployment bundle size, not local runtime).
- Mode B shots in the demo are lip-static (mock clips can't animate mouths).

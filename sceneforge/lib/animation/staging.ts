/**
 * Staging rules shared by storyboard keyframes, the timeline builder and the Remotion composition.
 * Pure functions (browser-safe).
 */
import type { CameraMove, Framing, TLCameraKey } from '../types';

export interface Placement {
  footY: number;
  heightFrac: number;
}

/**
 * Character placement for a framing. `aspect` = width / height. Values are tuned for 16:9; for narrower
 * frames (9:16) sprites are scaled down by sqrt(aspect / (16/9)) so they fit the width. Wide shots keep
 * their ground line, medium/close shots keep their head line.
 */
export function framingPlacement(framing: Framing, aspect = 16 / 9): Placement {
  const base = basePlacement(framing);
  const k = Math.min(1, Math.sqrt(aspect / (16 / 9)));
  if (k >= 0.999) return base;
  const heightFrac = base.heightFrac * k;
  if (framing === 'wide' || framing === 'establishing') return { footY: base.footY, heightFrac };
  const top = base.footY - base.heightFrac;
  return { footY: top + heightFrac, heightFrac };
}

function basePlacement(framing: Framing): Placement {
  switch (framing) {
    case 'establishing':
      return { footY: 0.93, heightFrac: 0.36 };
    case 'wide':
      return { footY: 0.95, heightFrac: 0.56 };
    case 'medium':
      return { footY: 1.34, heightFrac: 1.05 };
    case 'closeup':
      return { footY: 2.28, heightFrac: 2.05 };
    case 'extreme-closeup':
      return { footY: 3.4, heightFrac: 3.1 };
  }
}

/** Default horizontal slots for N characters. */
export function defaultSlots(n: number, framing: Framing): number[] {
  if (n <= 0) return [];
  if (framing === 'closeup' || framing === 'extreme-closeup') return n === 1 ? [0.5] : n === 2 ? [0.5, 1.25] : [0.5, 1.25, -0.25];
  if (n === 1) return [0.5];
  if (n === 2) return framing === 'medium' ? [0.3, 0.72] : [0.33, 0.67];
  if (n === 3) return [0.2, 0.5, 0.8];
  return Array.from({ length: n }, (_, i) => (i + 1) / (n + 1));
}

export function cameraKeys(move: CameraMove, intensity = 1): { from: TLCameraKey; to: TLCameraKey } {
  const k = intensity;
  switch (move) {
    case 'pan-left':
      return { from: { x: 0.05 * k, y: 0, zoom: 1.04 }, to: { x: -0.05 * k, y: 0, zoom: 1.04 } };
    case 'pan-right':
      return { from: { x: -0.05 * k, y: 0, zoom: 1.04 }, to: { x: 0.05 * k, y: 0, zoom: 1.04 } };
    case 'push-in':
      return { from: { x: 0, y: 0, zoom: 1 }, to: { x: 0, y: -0.01, zoom: 1 + 0.14 * k } };
    case 'pull-out':
      return { from: { x: 0, y: -0.01, zoom: 1 + 0.14 * k }, to: { x: 0, y: 0, zoom: 1 } };
    case 'tilt-up':
      return { from: { x: 0, y: 0.05 * k, zoom: 1.05 }, to: { x: 0, y: -0.03 * k, zoom: 1.05 } };
    case 'tilt-down':
      return { from: { x: 0, y: -0.03 * k, zoom: 1.05 }, to: { x: 0, y: 0.05 * k, zoom: 1.05 } };
    case 'shake':
    case 'static':
    default:
      return { from: { x: 0, y: 0, zoom: 1.0 }, to: { x: 0, y: 0, zoom: 1.015 } };
  }
}

export const EMOTION_TO_EXPRESSION: Record<string, string> = {
  neutral: 'neutral',
  calm: 'neutral',
  happy: 'happy',
  excited: 'happy',
  joyful: 'happy',
  playful: 'happy',
  angry: 'angry',
  shouting: 'angry',
  determined: 'angry',
  defiant: 'angry',
  sad: 'sad',
  hollow: 'sad',
  surprised: 'surprised',
  shocked: 'surprised',
  awed: 'surprised',
  worried: 'worried',
  scared: 'worried',
  uneasy: 'worried',
  whisper: 'neutral',
};

export function expressionFor(emotion: string, available: string[]): string {
  const e = EMOTION_TO_EXPRESSION[emotion.toLowerCase()] ?? 'neutral';
  if (available.includes(e)) return e;
  return available.includes('neutral') ? 'neutral' : available[0] ?? 'neutral';
}

/**
 * Fast still-frame compositor (sharp). Produces storyboard thumbnails and the deterministic "mock image"
 * start frames. It mirrors the layout rules used by the Remotion composition (cover-fit backgrounds,
 * characters positioned by x / footY / heightFrac).
 */
import sharp, { type OverlayOptions } from 'sharp';

export interface KeyframeCharacter {
  layers: string[]; // absolute paths, same-size stacked sprites (body, face, mouth…)
  x: number;
  footY: number;
  heightFrac: number;
  flip?: boolean;
}

export interface KeyframeSpec {
  width: number;
  height: number;
  backgroundColor: string;
  layers: string[]; // absolute paths, back to front (behind characters)
  frontLayers?: string[]; // foreground layers drawn over characters
  characters: KeyframeCharacter[];
  zoom?: number;
  focusX?: number;
  tint?: { color: string; opacity: number } | null;
  badge?: string | null;
  badgeCorner?: 'top-left' | 'bottom-right';
  caption?: string | null;
}

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);

async function sprite(c: KeyframeCharacter, H: number): Promise<{ buf: Buffer; w: number; h: number } | null> {
  if (!c.layers.length) return null;
  const meta = await sharp(c.layers[0]).metadata();
  const h = Math.max(2, Math.round(c.heightFrac * H));
  const w = Math.max(2, Math.round(((meta.width ?? 1) / (meta.height ?? 1)) * h));
  let img = sharp(c.layers[0]).resize(meta.width, meta.height);
  if (c.layers.length > 1) img = img.composite(c.layers.slice(1).map((input) => ({ input })));
  let buf = await img.png().toBuffer();
  let s = sharp(buf).resize(w, h);
  if (c.flip) s = s.flop();
  buf = await s.png().toBuffer();
  return { buf, w, h };
}

export async function renderKeyframe(spec: KeyframeSpec, outPath: string) {
  const { width: W, height: H } = spec;
  const comps: OverlayOptions[] = [];
  for (const l of spec.layers) {
    comps.push({ input: await sharp(l).resize(W, H, { fit: 'cover' }).png().toBuffer(), left: 0, top: 0 });
  }
  for (const c of spec.characters) {
    const sp = await sprite(c, H);
    if (!sp) continue;
    const left = Math.round(c.x * W - sp.w / 2);
    const top = Math.round(c.footY * H - sp.h);
    // crop to the visible intersection (sharp requires overlays inside the canvas)
    const x0 = Math.max(0, left);
    const y0 = Math.max(0, top);
    const x1 = Math.min(W, left + sp.w);
    const y1 = Math.min(H, top + sp.h);
    if (x1 - x0 < 1 || y1 - y0 < 1) continue;
    const crop = await sharp(sp.buf).extract({ left: x0 - left, top: y0 - top, width: x1 - x0, height: y1 - y0 }).png().toBuffer();
    comps.push({ input: crop, left: x0, top: y0 });
  }
  for (const l of spec.frontLayers ?? []) {
    comps.push({ input: await sharp(l).resize(W, H, { fit: 'cover' }).png().toBuffer(), left: 0, top: 0 });
  }
  if (spec.tint && spec.tint.opacity > 0) {
    comps.push({ input: Buffer.from(`<svg width="${W}" height="${H}"><rect width="100%" height="100%" fill="${esc(spec.tint.color)}" opacity="${spec.tint.opacity}"/></svg>`), left: 0, top: 0 });
  }
  let frame = await sharp({ create: { width: W, height: H, channels: 4, background: spec.backgroundColor } }).composite(comps).png().toBuffer();
  const zoom = spec.zoom ?? 1;
  if (zoom > 1.01) {
    const cw = Math.round(W / zoom);
    const ch = Math.round(H / zoom);
    const cx = Math.min(W - cw, Math.max(0, Math.round((spec.focusX ?? 0.5) * W - cw / 2)));
    const cy = Math.round((H - ch) * 0.35);
    frame = await sharp(frame).extract({ left: cx, top: cy, width: cw, height: ch }).resize(W, H).png().toBuffer();
  }
  const overlays: OverlayOptions[] = [];
  const fs = Math.round(H * 0.035);
  if (spec.badge) {
    const bw = spec.badge.length * fs * 0.62 + fs;
    const bx = spec.badgeCorner === 'bottom-right' ? W - bw - fs * 0.6 : fs * 0.6;
    const by = spec.badgeCorner === 'bottom-right' ? H - fs * 2.2 : fs * 0.6;
    overlays.push({
      input: Buffer.from(
        `<svg width="${W}" height="${H}"><rect x="${bx}" y="${by}" rx="${fs * 0.3}" width="${bw}" height="${fs * 1.6}" fill="#000" opacity="0.6"/><text x="${bx + fs * 0.5}" y="${by + fs * 1.15}" font-family="DejaVu Sans, sans-serif" font-weight="bold" font-size="${fs}" fill="#ffcc33">${esc(spec.badge)}</text></svg>`,
      ),
      left: 0,
      top: 0,
    });
  }
  if (spec.caption) {
    overlays.push({
      input: Buffer.from(
        `<svg width="${W}" height="${H}"><rect x="0" y="${H - fs * 2.2}" width="${W}" height="${fs * 2.2}" fill="#000" opacity="0.55"/><text x="${W / 2}" y="${H - fs * 0.75}" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="${fs}" fill="#fff">${esc(spec.caption.slice(0, 90))}</text></svg>`,
      ),
      left: 0,
      top: 0,
    });
  }
  const img = overlays.length ? sharp(frame).composite(overlays) : sharp(frame);
  await img.png().toFile(outPath);
  return outPath;
}

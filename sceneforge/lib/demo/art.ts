/**
 * Original procedural demo artwork (flat 2D cartoon/anime style), generated as SVG and rasterized to PNG.
 * Characters are produced as same-size stacked layers (body/pose, face/expression, eyes-closed, mouths)
 * so they plug straight into the limited-animation sprite rig. All art here is original to SceneForge.
 */
import sharp from 'sharp';
import { rng } from '../audio/synth';

const OUT = '#2a1f2d';
const CW = 600;
const CH = 1200;

export interface CharacterDesign {
  key: string;
  skin: string;
  hair: string;
  hairShade: string;
  iris: string;
  top: string;
  topShade: string;
  inner: string;
  pants: string;
  shoes: string;
  hairStyle: 'spiky' | 'bun' | 'beanie';
  accent: string;
  bodyWidth: number; // 1 = normal
  eyeScale: number;
  long?: boolean; // long cardigan/skirt
  bag?: boolean;
}

export const DEMO_CHARACTERS: CharacterDesign[] = [
  { key: 'miko', skin: '#ffd9bf', hair: '#e8582c', hairShade: '#b8401e', iris: '#2f8f83', top: '#2a9d8f', topShade: '#1f776c', inner: '#fff4e0', pants: '#2b2d42', shoes: '#7a4b2a', hairStyle: 'spiky', accent: '#ffd23f', bodyWidth: 1, eyeScale: 1.08, bag: true },
  { key: 'bram', skin: '#9a6440', hair: '#1d1716', hairShade: '#0d0a0a', iris: '#5a3a22', top: '#f08a24', topShade: '#c86a12', inner: '#f08a24', pants: '#35508c', shoes: '#f4f1ea', hairStyle: 'beanie', accent: '#3a6ea5', bodyWidth: 1.22, eyeScale: 0.95 },
  { key: 'sato', skin: '#f1c9a5', hair: '#cfd2d8', hairShade: '#9ea3ad', iris: '#4a3b5c', top: '#7b5ea7', topShade: '#5c4485', inner: '#efe6d2', pants: '#3d2c4e', shoes: '#3d2c1e', hairStyle: 'bun', accent: '#c94f6d', bodyWidth: 1.05, eyeScale: 0.8, long: true },
];

const svg = (inner: string, w = CW, h = CH) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${inner}</svg>`;

function limb(x1: number, y1: number, x2: number, y2: number, color: string, w: number) {
  return `<path d="M${x1},${y1} L${x2},${y2}" stroke="${OUT}" stroke-width="${w + 12}" stroke-linecap="round"/><path d="M${x1},${y1} L${x2},${y2}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;
}

function spikes(cx: number, cy: number, r1: number, r2: number, a0: number, a1: number, n: number) {
  const pts: string[] = [];
  for (let i = 0; i <= n * 2; i++) {
    const a = ((a0 + ((a1 - a0) * i) / (n * 2)) * Math.PI) / 180;
    const r = i % 2 ? r2 : r1;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`);
  }
  return pts.join(' ');
}

type Pose = 'idle' | 'cheer' | 'point';

export function bodySvg(d: CharacterDesign, pose: Pose): string {
  const bw = d.bodyWidth;
  const tx = (x: number) => 300 + (x - 300) * bw;
  const parts: string[] = [];
  // back hair
  if (d.hairStyle === 'spiky') parts.push(`<polygon points="${spikes(300, 250, 150, 192, 150, 390, 9)}" fill="${d.hairShade}" stroke="${OUT}" stroke-width="6" stroke-linejoin="round"/>`);
  if (d.hairStyle === 'bun') parts.push(`<circle cx="300" cy="92" r="58" fill="${d.hair}" stroke="${OUT}" stroke-width="6"/><path d="M262,70 Q300,50 338,70" stroke="${d.hairShade}" stroke-width="6" fill="none"/>`);
  if (d.hairStyle === 'beanie') parts.push(`<g fill="${d.hair}" stroke="${OUT}" stroke-width="5">${[150, 175, 200, 225, 250, 275].map((y, i) => `<circle cx="${158 - (i % 2) * 8}" cy="${y + 40}" r="24"/><circle cx="${442 + (i % 2) * 8}" cy="${y + 40}" r="24"/>`).join('')}</g>`);
  // legs + shoes
  const legTop = d.long ? 980 : 760;
  parts.push(`<rect x="${tx(238)}" y="${legTop}" width="${54 * bw}" height="${1125 - legTop}" rx="24" fill="${d.pants}" stroke="${OUT}" stroke-width="6"/>`);
  parts.push(`<rect x="${tx(308)}" y="${legTop}" width="${54 * bw}" height="${1125 - legTop}" rx="24" fill="${d.pants}" stroke="${OUT}" stroke-width="6"/>`);
  parts.push(`<ellipse cx="${tx(258)}" cy="1142" rx="50" ry="27" fill="${d.shoes}" stroke="${OUT}" stroke-width="6"/><ellipse cx="${tx(342)}" cy="1142" rx="50" ry="27" fill="${d.shoes}" stroke="${OUT}" stroke-width="6"/>`);
  // skirt / long cardigan
  if (d.long) parts.push(`<path d="M${tx(205)},740 L${tx(170)},1000 Q300,1030 ${tx(430)},1000 L${tx(395)},740 Z" fill="${d.topShade}" stroke="${OUT}" stroke-width="6" stroke-linejoin="round"/>`);
  // arms (behind torso when idle)
  const sl = [tx(212), 470];
  const sr = [tx(388), 470];
  const armW = 50 * Math.sqrt(bw);
  const arms: Record<Pose, [number[], number[]]> = {
    idle: [[tx(165), 715], [tx(435), 715]],
    cheer: [[tx(140), 250], [tx(460), 250]],
    point: [[tx(165), 715], [tx(520), 420]],
  };
  const [hl, hr] = arms[pose];
  const drawArms = () => `${limb(sl[0], sl[1], hl[0], hl[1], d.top, armW)}${limb(sr[0], sr[1], hr[0], hr[1], d.top, armW)}<circle cx="${hl[0]}" cy="${hl[1] + (pose === 'cheer' ? -10 : 12)}" r="29" fill="${d.skin}" stroke="${OUT}" stroke-width="6"/><circle cx="${hr[0]}" cy="${hr[1] + (pose === 'idle' ? 12 : -10)}" r="29" fill="${d.skin}" stroke="${OUT}" stroke-width="6"/>`;
  // torso
  parts.push(`<rect x="${tx(200)}" y="420" width="${200 * bw}" height="${d.long ? 340 : 360}" rx="62" fill="${d.top}" stroke="${OUT}" stroke-width="6"/>`);
  if (d.inner !== d.top) parts.push(`<path d="M268,428 L332,428 L322,${d.long ? 760 : 778} L278,${d.long ? 760 : 778} Z" fill="${d.inner}" stroke="${OUT}" stroke-width="5"/>`);
  else parts.push(`<rect x="${tx(240)}" y="630" width="${120 * bw}" height="70" rx="20" fill="${d.topShade}" stroke="${OUT}" stroke-width="5"/>`); // hoodie pocket
  parts.push(`<path d="M${tx(208)},700 Q300,725 ${tx(392)},700" stroke="${d.topShade}" stroke-width="10" fill="none" opacity="0.7"/>`);
  if (d.bag) parts.push(`<path d="M${tx(225)},440 L${tx(380)},690" stroke="#6b3e1f" stroke-width="18" stroke-linecap="round"/><rect x="${tx(345)}" y="650" width="96" height="84" rx="14" fill="#8a5a2b" stroke="${OUT}" stroke-width="6"/><rect x="${tx(355)}" y="660" width="76" height="26" rx="8" fill="#a8743f"/>`);
  parts.push(drawArms());
  // neck + head
  parts.push(`<rect x="274" y="378" width="52" height="62" rx="14" fill="${d.skin}" stroke="${OUT}" stroke-width="6"/>`);
  parts.push(`<circle cx="160" cy="282" r="25" fill="${d.skin}" stroke="${OUT}" stroke-width="6"/><circle cx="440" cy="282" r="25" fill="${d.skin}" stroke="${OUT}" stroke-width="6"/>`);
  parts.push(`<ellipse cx="300" cy="262" rx="140" ry="150" fill="${d.skin}" stroke="${OUT}" stroke-width="6"/>`);
  parts.push(`<ellipse cx="222" cy="326" rx="22" ry="11" fill="#ff8fa3" opacity="0.45"/><ellipse cx="378" cy="326" rx="22" ry="11" fill="#ff8fa3" opacity="0.45"/>`);
  parts.push(`<path d="M300,300 Q306,312 298,318" stroke="${OUT}" stroke-width="4" fill="none" opacity="0.6"/>`);
  // front hair
  if (d.hairStyle === 'spiky') {
    parts.push(`<path d="M158,248 Q160,108 300,100 Q440,108 442,248 L420,205 L398,240 L372,196 L346,236 L318,192 L292,238 L264,196 L240,240 L214,200 L190,238 L176,206 Z" fill="${d.hair}" stroke="${OUT}" stroke-width="6" stroke-linejoin="round"/>`);
    parts.push(`<path d="M168,186 Q300,128 432,186" stroke="${d.accent}" stroke-width="24" fill="none" stroke-linecap="round"/><path d="M430,184 L478,166 L470,206 Z" fill="${d.accent}" stroke="${OUT}" stroke-width="4"/>`);
  }
  if (d.hairStyle === 'bun') parts.push(`<path d="M160,252 Q156,112 300,108 Q444,112 440,252 Q420,176 300,170 Q300,190 292,176 Q206,180 160,252 Z" fill="${d.hair}" stroke="${OUT}" stroke-width="6" stroke-linejoin="round"/><circle cx="300" cy="300" r="0"/>`);
  if (d.hairStyle === 'beanie')
    parts.push(
      `<path d="M150,190 Q150,72 300,68 Q450,72 450,190 Z" fill="${d.accent}" stroke="${OUT}" stroke-width="6"/><rect x="144" y="160" width="312" height="40" rx="20" fill="#2f5a87" stroke="${OUT}" stroke-width="6"/><circle cx="300" cy="62" r="30" fill="#f4f1ea" stroke="${OUT}" stroke-width="6"/>` +
        [190, 230, 270, 310, 350, 390].map((x) => `<path d="M${x},88 L${x},160" stroke="#2f5a87" stroke-width="5" opacity="0.5"/>`).join(''),
    );
  if (d.key === 'bram') parts.push(`<g fill="#5e3a22" opacity="0.6">${[[230, 304], [244, 312], [216, 314], [370, 304], [356, 312], [384, 314]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.5"/>`).join('')}</g>`);
  return svg(parts.join(''));
}

const EYE_L = 246;
const EYE_R = 354;
const EYE_Y = 280;

export function faceSvg(d: CharacterDesign, expr: string): string {
  const s = d.eyeScale;
  const parts: string[] = [];
  const brow = (l: [number, number, number, number], r: [number, number, number, number]) =>
    `<path d="M${l[0]},${l[1]} L${l[2]},${l[3]}" stroke="${d.hairShade}" stroke-width="11" stroke-linecap="round"/><path d="M${r[0]},${r[1]} L${r[2]},${r[3]}" stroke="${d.hairShade}" stroke-width="11" stroke-linecap="round"/>`;
  const eye = (x: number, opts: { pupil?: number; dy?: number; lid?: 'angry' | 'sad' | null; tall?: number } = {}) => {
    const rx = 25 * s;
    const ry = 33 * s * (opts.tall ?? 1);
    const ir = (opts.pupil ?? 1) * s;
    const dy = opts.dy ?? 0;
    let e = `<ellipse cx="${x}" cy="${EYE_Y}" rx="${rx}" ry="${ry}" fill="#fff" stroke="${OUT}" stroke-width="4"/>`;
    e += `<ellipse cx="${x}" cy="${EYE_Y + 4 + dy}" rx="${16 * ir}" ry="${23 * ir}" fill="${d.iris}"/><ellipse cx="${x}" cy="${EYE_Y + 6 + dy}" rx="${8 * ir}" ry="${12 * ir}" fill="#1a1420"/><circle cx="${x + 6 * ir}" cy="${EYE_Y - 7 + dy}" r="${6 * ir}" fill="#fff"/>`;
    e += `<path d="M${x - rx - 3},${EYE_Y - ry * 0.45} Q${x},${EYE_Y - ry - 8} ${x + rx + 3},${EYE_Y - ry * 0.45}" stroke="${OUT}" stroke-width="8" fill="none" stroke-linecap="round"/>`;
    if (opts.lid) {
      const inner = x < 300 ? x + rx : x - rx;
      const outer = x < 300 ? x - rx : x + rx;
      const yi = opts.lid === 'angry' ? EYE_Y - ry * 0.05 : EYE_Y - ry * 0.75;
      const yo = opts.lid === 'angry' ? EYE_Y - ry * 0.75 : EYE_Y - ry * 0.1;
      e += `<path d="M${outer - 6},${EYE_Y - ry - 12} L${inner + (x < 300 ? 6 : -6)},${EYE_Y - ry - 12} L${inner + (x < 300 ? 6 : -6)},${yi} L${outer - (x < 300 ? 6 : -6)},${yo} Z" fill="${d.skin}"/><path d="M${inner},${yi} L${outer},${yo}" stroke="${OUT}" stroke-width="7" stroke-linecap="round"/>`;
    }
    return e;
  };
  const happyEye = (x: number) => `<path d="M${x - 24},${EYE_Y + 8} Q${x},${EYE_Y - 24} ${x + 24},${EYE_Y + 8}" stroke="${OUT}" stroke-width="9" fill="none" stroke-linecap="round"/>`;
  switch (expr) {
    case 'happy':
      parts.push(happyEye(EYE_L), happyEye(EYE_R), brow([212, 214, 268, 206], [332, 206, 388, 214]));
      break;
    case 'angry':
      parts.push(eye(EYE_L, { lid: 'angry' }), eye(EYE_R, { lid: 'angry' }), brow([212, 210, 274, 240], [326, 240, 388, 210]));
      break;
    case 'sad':
      parts.push(eye(EYE_L, { lid: 'sad', dy: 5 }), eye(EYE_R, { lid: 'sad', dy: 5 }), brow([212, 238, 270, 214], [330, 214, 388, 238]));
      break;
    case 'surprised':
      parts.push(eye(EYE_L, { pupil: 0.62, tall: 1.12 }), eye(EYE_R, { pupil: 0.62, tall: 1.12 }), brow([212, 196, 270, 188], [330, 188, 388, 196]));
      break;
    case 'worried':
      parts.push(eye(EYE_L, { pupil: 0.8 }), eye(EYE_R, { pupil: 0.8 }), brow([212, 228, 270, 206], [330, 206, 388, 228]));
      parts.push(`<path d="M424,196 Q438,222 426,232 Q410,226 424,196 Z" fill="#9ed8ff" stroke="${OUT}" stroke-width="3"/>`);
      break;
    default:
      parts.push(eye(EYE_L), eye(EYE_R), brow([212, 224, 270, 218], [330, 218, 388, 224]));
  }
  return svg(parts.join(''));
}

export function eyesClosedSvg(d: CharacterDesign): string {
  const s = d.eyeScale;
  const lid = (x: number) =>
    `<ellipse cx="${x}" cy="${EYE_Y + 2}" rx="${31 * s}" ry="${40 * s}" fill="${d.skin}"/><path d="M${x - 25},${EYE_Y + 4} Q${x},${EYE_Y + 16} ${x + 25},${EYE_Y + 4}" stroke="${OUT}" stroke-width="8" fill="none" stroke-linecap="round"/>`;
  return svg(lid(EYE_L) + lid(EYE_R));
}

export function mouthSvg(shape: 'closed' | 'open' | 'wide'): string {
  if (shape === 'closed') return svg(`<path d="M278,348 Q300,362 322,348" stroke="${OUT}" stroke-width="6" fill="none" stroke-linecap="round"/>`);
  if (shape === 'open')
    return svg(`<ellipse cx="300" cy="354" rx="19" ry="14" fill="#5b1a2a" stroke="${OUT}" stroke-width="5"/><ellipse cx="300" cy="362" rx="10" ry="5" fill="#e0607e"/>`);
  return svg(`<path d="M272,342 Q300,336 328,342 Q330,384 300,388 Q270,384 272,342 Z" fill="#5b1a2a" stroke="${OUT}" stroke-width="5"/><rect x="282" y="341" width="36" height="9" rx="3" fill="#fff"/><ellipse cx="300" cy="376" rx="14" ry="7" fill="#e0607e"/>`);
}

export async function rasterize(svgText: string, out: string, width?: number) {
  let img = sharp(Buffer.from(svgText), { density: 96 });
  if (width) img = img.resize(width);
  await img.png().toFile(out);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Environments: separate parallax layers (back → front). 2112×1188 = 1.1 × 1080p.
// ---------------------------------------------------------------------------------------------

const EW = 2112;
const EH = 1188;
const esvg = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${EW}" height="${EH}" viewBox="0 0 ${EW} ${EH}">${inner}</svg>`;

function clouds(r: () => number, n: number, yMax: number, color: string, opacity = 0.9) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = r() * EW;
    const y = 80 + r() * yMax;
    const sc = 0.6 + r() * 0.9;
    s += `<g opacity="${opacity}" fill="${color}"><ellipse cx="${x}" cy="${y}" rx="${110 * sc}" ry="${40 * sc}"/><ellipse cx="${x - 60 * sc}" cy="${y + 10}" rx="${70 * sc}" ry="${32 * sc}"/><ellipse cx="${x + 70 * sc}" cy="${y + 8}" rx="${80 * sc}" ry="${30 * sc}"/><ellipse cx="${x + 10}" cy="${y - 28 * sc}" rx="${60 * sc}" ry="${36 * sc}"/></g>`;
  }
  return s;
}

function lantern(x: number, y: number, s: number, color: string, glow = true) {
  return `${glow ? `<circle cx="${x}" cy="${y}" r="${48 * s}" fill="${color}" opacity="0.25"/>` : ''}<path d="M${x},${y - 60 * s} L${x},${y - 34 * s}" stroke="#3a2a1a" stroke-width="${3 * s}"/><rect x="${x - 14 * s}" y="${y - 38 * s}" width="${28 * s}" height="${8 * s}" fill="#3a2a1a"/><ellipse cx="${x}" cy="${y}" rx="${26 * s}" ry="${32 * s}" fill="${color}" stroke="#3a2a1a" stroke-width="${3 * s}"/><path d="M${x - 26 * s},${y} Q${x},${y + 8 * s} ${x + 26 * s},${y}" stroke="#3a2a1a" stroke-width="${2 * s}" fill="none" opacity="0.5"/><path d="M${x},${y - 32 * s} L${x},${y + 32 * s}" stroke="#3a2a1a" stroke-width="${2 * s}" opacity="0.4"/><rect x="${x - 10 * s}" y="${y + 30 * s}" width="${20 * s}" height="${7 * s}" fill="#3a2a1a"/>`;
}

function house(x: number, w: number, h: number, ground: number, wall: string, roof: string, lit: boolean) {
  const top = ground - h;
  let s = `<rect x="${x}" y="${top}" width="${w}" height="${h}" fill="${wall}" stroke="${OUT}" stroke-width="5"/>`;
  s += `<polygon points="${x - 22},${top} ${x + w / 2},${top - h * 0.45} ${x + w + 22},${top}" fill="${roof}" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/>`;
  const cols = Math.max(1, Math.floor(w / 90));
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < Math.max(1, Math.floor(h / 120)); r++) {
      const wx = x + 25 + c * ((w - 50) / cols) + 10;
      const wy = top + 30 + r * 110;
      if (wy + 60 > ground - 90) continue;
      s += `<rect x="${wx}" y="${wy}" width="46" height="56" rx="4" fill="${lit ? '#ffd56b' : '#bfe3f2'}" stroke="${OUT}" stroke-width="4"/><path d="M${wx + 23},${wy} L${wx + 23},${wy + 56} M${wx},${wy + 28} L${wx + 46},${wy + 28}" stroke="${OUT}" stroke-width="3"/>`;
    }
  s += `<rect x="${x + w / 2 - 28}" y="${ground - 92}" width="56" height="92" rx="6" fill="#6b3e1f" stroke="${OUT}" stroke-width="4"/>`;
  return s;
}

export interface EnvLayers {
  key: string;
  name: string;
  category: string;
  timeOfDay: 'day' | 'sunset' | 'night' | 'interior' | 'dawn';
  backgroundColor: string;
  weather: string;
  layers: { role: 'background' | 'midground' | 'foreground'; parallax: number; svg: string }[];
}

export function demoEnvironments(): EnvLayers[] {
  const r = rng(11);
  const ground = 990;
  // Workshop (interior)
  let shelves = '';
  for (const y of [300, 560]) {
    shelves += `<rect x="260" y="${y}" width="1600" height="26" fill="#6b3e1f" stroke="${OUT}" stroke-width="5"/>`;
    for (let i = 0; i < 9; i++) shelves += lantern(360 + i * 170, y - 52, 1.05, ['#e8463c', '#f5a623', '#ffd23f', '#f06d9b'][i % 4], false);
  }
  const workshop: EnvLayers = {
    key: 'workshop',
    name: 'Lantern Workshop',
    category: 'general',
    timeOfDay: 'interior',
    backgroundColor: '#5c3720',
    weather: 'dust',
    layers: [
      {
        role: 'background',
        parallax: 0.2,
        svg: esvg(
          `<defs><linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a5532"/><stop offset="1" stop-color="#5c3720"/></linearGradient><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb26b"/><stop offset="1" stop-color="#ffe3a3"/></linearGradient></defs>` +
            `<rect width="${EW}" height="${EH}" fill="url(#w)"/>` +
            Array.from({ length: 22 }, (_, i) => `<path d="M${i * 100},0 L${i * 100},${EH}" stroke="#4a2c18" stroke-width="4" opacity="0.5"/>`).join('') +
            `<rect x="1560" y="120" width="380" height="330" rx="10" fill="url(#sky)" stroke="${OUT}" stroke-width="10"/><circle cx="1700" cy="330" r="60" fill="#fff3c4"/><path d="M1750,120 L1750,450 M1560,285 L1940,285" stroke="${OUT}" stroke-width="10"/>` +
            `<rect x="0" y="${ground - 60}" width="${EW}" height="${EH}" fill="#4a2c18"/>` +
            Array.from({ length: 12 }, (_, i) => `<path d="M${i * 190},${ground - 60} L${i * 190 - 120},${EH}" stroke="#3a2212" stroke-width="4"/>`).join(''),
        ),
      },
      { role: 'midground', parallax: 0.55, svg: esvg(shelves) },
      {
        role: 'foreground',
        parallax: 1.3,
        svg: esvg(
          `<rect x="-20" y="1050" width="760" height="160" rx="10" fill="#7a4b2a" stroke="${OUT}" stroke-width="8"/><rect x="60" y="990" width="90" height="60" rx="8" fill="#c0c7d1" stroke="${OUT}" stroke-width="6"/>${lantern(380, 960, 1.3, '#e8463c')}` +
            `<rect x="1800" y="1020" width="400" height="200" rx="10" fill="#7a4b2a" stroke="${OUT}" stroke-width="8"/>`,
        ),
      },
    ],
  };

  // Hillmoor Street (day)
  const housesSvg = [
    house(80, 260, 330, ground - 40, '#f4d6a0', '#c94f6d', false),
    house(400, 220, 420, ground - 40, '#bfe0d0', '#3a6ea5', false),
    house(680, 300, 300, ground - 40, '#f7c59f', '#8a5a2b', false),
    house(1240, 260, 380, ground - 40, '#d7c4f0', '#c94f6d', false),
    house(1560, 240, 300, ground - 40, '#f4d6a0', '#2a9d8f', false),
    house(1850, 230, 360, ground - 40, '#bfe0d0', '#8a5a2b', false),
  ].join('');
  const street: EnvLayers = {
    key: 'street',
    name: 'Hillmoor Street',
    category: 'city',
    timeOfDay: 'day',
    backgroundColor: '#8fd3ff',
    weather: 'none',
    layers: [
      {
        role: 'background',
        parallax: 0.12,
        svg: esvg(
          `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6ec6ff"/><stop offset="1" stop-color="#fff1c9"/></linearGradient></defs><rect width="${EW}" height="${EH}" fill="url(#s)"/><circle cx="1700" cy="210" r="90" fill="#fff6c8"/>${clouds(r, 7, 260, '#ffffff')}` +
            `<path d="M0,760 Q300,560 640,700 Q980,520 1340,690 Q1700,560 ${EW},700 L${EW},${EH} L0,${EH} Z" fill="#8cc084" stroke="${OUT}" stroke-width="5"/>`,
        ),
      },
      {
        role: 'midground',
        parallax: 0.5,
        svg: esvg(`${housesSvg}<rect x="0" y="${ground - 40}" width="${EW}" height="${EH}" fill="#c9b79c" stroke="${OUT}" stroke-width="5"/>` + Array.from({ length: 14 }, (_, i) => `<rect x="${i * 160 + 20}" y="${ground + 40}" width="90" height="14" rx="6" fill="#efe6d2" opacity="0.8"/>`).join('')),
      },
      {
        role: 'foreground',
        parallax: 1.35,
        svg: esvg(
          [60, 2010]
            .map((x) => `<rect x="${x}" y="420" width="26" height="780" fill="#2b2d42" stroke="${OUT}" stroke-width="4"/>${lantern(x + 13, 470, 1.4, '#ffd23f', false)}`)
            .join('') + `<g fill="#4f8a3c" stroke="${OUT}" stroke-width="5"><circle cx="230" cy="1150" r="90"/><circle cx="330" cy="1170" r="70"/><circle cx="1880" cy="1160" r="95"/></g>`,
        ),
      },
    ],
  };

  // Storm Bridge
  const storm: EnvLayers = {
    key: 'bridge',
    name: 'Storm Bridge',
    category: 'fantasy',
    timeOfDay: 'dawn',
    backgroundColor: '#3a4660',
    weather: 'rain',
    layers: [
      {
        role: 'background',
        parallax: 0.12,
        svg: esvg(
          `<defs><linearGradient id="st" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a3148"/><stop offset="1" stop-color="#6b7894"/></linearGradient></defs><rect width="${EW}" height="${EH}" fill="url(#st)"/>${clouds(r, 10, 300, '#46506b', 1)}${clouds(r, 6, 200, '#39415a', 1)}` +
            `<path d="M1300,140 L1250,330 L1310,320 L1240,520" stroke="#fff7c2" stroke-width="10" fill="none" opacity="0.9"/>` +
            `<path d="M0,720 Q400,600 820,700 Q1300,580 ${EW},690 L${EW},${EH} L0,${EH} Z" fill="#3f5a4f" stroke="${OUT}" stroke-width="5"/><rect x="0" y="820" width="${EW}" height="${EH}" fill="#4b6584"/>` +
            Array.from({ length: 30 }, () => `<path d="M${r() * EW},${840 + r() * 300} q30,-10 60,0" stroke="#7f9ab8" stroke-width="4" fill="none"/>`).join(''),
        ),
      },
      {
        role: 'midground',
        parallax: 0.6,
        svg: esvg(`<rect x="0" y="${ground - 50}" width="${EW}" height="${EH}" fill="#7a5a3a" stroke="${OUT}" stroke-width="6"/>` + Array.from({ length: 30 }, (_, i) => `<path d="M${i * 74},${ground - 50} L${i * 74},${EH}" stroke="#5c4128" stroke-width="5"/>`).join('')),
      },
      {
        role: 'foreground',
        parallax: 1.3,
        svg: esvg(
          Array.from({ length: 6 }, (_, i) => `<rect x="${i * 420 - 20}" y="930" width="40" height="300" rx="8" fill="#5c4128" stroke="${OUT}" stroke-width="5"/>`).join('') +
            `<path d="M-20,960 Q190,1010 400,960 Q610,1010 820,960 Q1030,1010 1240,960 Q1450,1010 1660,960 Q1870,1010 2120,960" stroke="#c9a46a" stroke-width="14" fill="none"/>`,
        ),
      },
    ],
  };

  // Festival Plaza at Night
  let stars = '';
  for (let i = 0; i < 140; i++) stars += `<circle cx="${r() * EW}" cy="${r() * 560}" r="${1 + r() * 2.4}" fill="#fff" opacity="${0.4 + r() * 0.6}"/>`;
  let strings = '';
  for (const [y0, sag] of [[120, 120], [260, 90]] as const) {
    strings += `<path d="M-20,${y0} Q${EW / 2},${y0 + sag * 2} ${EW + 20},${y0}" stroke="#2a1f2d" stroke-width="4" fill="none"/>`;
    for (let i = 1; i < 16; i++) {
      const t = i / 16;
      const x = -20 + t * (EW + 40);
      const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * (y0 + sag * 2) + t * t * y0;
      strings += lantern(x, y + 40, 0.8, ['#e8463c', '#ffd23f', '#f5a623', '#f06d9b', '#5ee7ff'][i % 5]);
    }
  }
  const plaza: EnvLayers = {
    key: 'plaza',
    name: 'Festival Plaza at Night',
    category: 'night-sky',
    timeOfDay: 'night',
    backgroundColor: '#0b1030',
    weather: 'fireflies',
    layers: [
      {
        role: 'background',
        parallax: 0.1,
        svg: esvg(`<defs><linearGradient id="n" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1030"/><stop offset="1" stop-color="#3b3f8a"/></linearGradient></defs><rect width="${EW}" height="${EH}" fill="url(#n)"/>${stars}<circle cx="380" cy="190" r="70" fill="#fdf6d8"/><circle cx="405" cy="175" r="62" fill="#0f1438" opacity="0.9"/>`),
      },
      {
        role: 'midground',
        parallax: 0.45,
        svg: esvg(
          [house(40, 280, 360, ground - 40, '#3b3360', '#241e3d', true), house(380, 240, 460, ground - 40, '#41386b', '#241e3d', true), house(1400, 300, 400, ground - 40, '#3b3360', '#241e3d', true), house(1760, 260, 330, ground - 40, '#41386b', '#241e3d', true)].join('') +
            `<rect x="930" y="300" width="250" height="660" fill="#5a4a7a" stroke="${OUT}" stroke-width="6"/><polygon points="900,300 1055,150 1210,300" fill="#c94f6d" stroke="${OUT}" stroke-width="6"/>${lantern(1055, 420, 2.2, '#ffd23f')}` +
            `<rect x="0" y="${ground - 40}" width="${EW}" height="${EH}" fill="#4a4060" stroke="${OUT}" stroke-width="5"/>` +
            Array.from({ length: 18 }, (_, i) => `<path d="M${i * 130},${ground - 40} L${i * 130 - 80},${EH}" stroke="#3a3250" stroke-width="4"/>`).join(''),
        ),
      },
      { role: 'foreground', parallax: 1.25, svg: esvg(strings) },
    ],
  };
  return [workshop, street, storm, plaza];
}

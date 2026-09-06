// Rainbow effect modules. Shared interface, one function per effect:
//   color(x, y, t, env) -> CSS color for one glyph cell (t is speed-scaled seconds)
//   char?(x, y, t, ch, env) -> replacement glyph, or null to keep the art
//   rowShift?(y, t, env) -> px translateY for a whole row
//   shadow?(t, env) -> text-shadow applied at row level (inherits down)
// env = { cols, rows, cx, cy } — geometry, precomputed once.

// deterministic 3-int hash → 0..1, so every effect stays frame-stable without state
function h3(x, y, k) {
  let n = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ Math.imul(k + 1, 2246822519);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

// quantized so memoized spans get string-identical colors between frames
const hsl = (h, s, l) => `hsl(${Math.round(((h % 360) + 360) % 360)} ${s | 0}% ${Math.round(l)}%)`;

export const EFFECTS = [
  {
    id: 'shine',
    name: 'shine',
    blurb: 'rainbow base, white specular sweep',
    color(x, y, t, env) {
      const fx = x / env.cols;
      const band = ((t * 0.35) % 1.35) - 0.175;
      const d = Math.abs(fx - band);
      if (d < 0.07) return hsl(fx * 300 + t * 20, 45, 52 + 45 * (1 - d / 0.07));
      return hsl(fx * 300, 88, 52);
    },
  },
  {
    id: 'bloom',
    name: 'bloom',
    blurb: 'glowing rainbow, breathing light',
    color(x, y, t, env) {
      const h = (x / env.cols) * 360 + y * 8 + t * 30;
      const l = 55 + 24 * Math.sin(t * 2 + (x + y) * 0.3);
      return hsl(h, 100, l);
    },
    shadow() {
      // neutral white bloom in em — scales with the view's font-size (hero 17px, tiles 8.6px)
      return '0 0 .4em hsla(0,0%,100%,.6), 0 0 .95em hsla(0,0%,100%,.3)';
    },
  },
  {
    id: 'across',
    name: 'across',
    blurb: 'full spectrum sweeping left to right',
    color(x, y, t, env) {
      return hsl(((x / env.cols) + t * 0.22) * 360, 100, 60);
    },
  },
  {
    id: 'spiral',
    name: 'spiral',
    blurb: 'hue winds around the face center',
    color(x, y, t, env) {
      const dx = x - env.cx;
      const dy = (y - env.cy) * 2.1; // mono cell aspect ≈ 1:2
      const ang = Math.atan2(dy, dx) * 57.2958;
      const r = Math.hypot(dx, dy);
      return hsl(ang + r * 12 - t * 90, 95, 60);
    },
  },
  {
    id: 'full',
    name: 'full rainbow',
    blurb: 'every glyph its own hue, drifting',
    color(x, y, t) {
      return hsl(x * 9 + y * 17 + t * 40, 100, 60);
    },
  },
  {
    id: 'smooth',
    name: 'smooth',
    blurb: 'soft pastel gradient, slow drift',
    color(x, y, t, env) {
      const h = 220 + (y / env.rows) * 130 + t * 8;
      const l = 70 + 7 * Math.sin(t + y * 0.5 + x * 0.1);
      return hsl(h, 60, l);
    },
  },
  {
    id: 'wave',
    name: 'wave',
    blurb: 'hue ripples and the rows bob',
    color(x, y, t, env) {
      return hsl((x / env.cols) * 360 - t * 60 + y * 6, 100, 62);
    },
    rowShift(y, t) {
      return Math.sin(t * 2.2 + y * 0.55) * 3;
    },
  },
  {
    id: 'rain',
    name: 'rain',
    blurb: 'rainbow columns falling downward',
    color(x, y, t, env) {
      return hsl(x * 13 + (y - t * 9) * 11, 100, 58); // ~2.5s per grid fall: readable rain
    },
  },
  {
    id: 'matrix',
    name: 'matrix',
    blurb: 'digital green with code flickers',
    color(x, y, t, env) {
      const k = Math.floor(t * 8);
      if (h3(x, y, k) < 0.07) return hsl(120 + h3(x, y, k + 99) * 40, 100, 72); // stay green
      return hsl(135, 100, 35 + h3(x, y, k + 7) * 35);
    },
    char(x, y, t, ch, env) {
      if (ch === ' ') return null;
      return h3(x, y, Math.floor(t * 6)) < 0.05 ? '01<>/*+=' [Math.floor(h3(x, y, Math.floor(t * 6) + 3) * 8)] : null;
    },
  },
  {
    id: 'glitch',
    name: 'glitch',
    blurb: 'signal loss, torn spectrum rows',
    color(x, y, t) {
      const row = h3(0, y, Math.floor(t * 12));
      if (row < 0.16) return hsl(row * 1500 + t * 200, 100, 62);
      return hsl(0, 0, 82);
    },
    rowShift(y, t) {
      return h3(1, y, Math.floor(t * 12)) < 0.12 ? (h3(2, y, Math.floor(t * 12)) - 0.5) * 6 : 0;
    },
  },
  {
    id: 'pulse',
    name: 'pulse',
    blurb: 'light rings breathing out from center',
    color(x, y, t, env) {
      const dx = x - env.cx;
      const dy = (y - env.cy) * 2.1;
      const r = Math.hypot(dx, dy);
      const l = 58 - 30 * Math.sin(t * 3 - r * 0.28);
      return hsl(r * 14 + t * 45, 100, l);
    },
  },
  {
    id: 'scanline',
    name: 'scanline',
    blurb: 'bright bar scans the spectrum down',
    color(x, y, t, env) {
      const scan = (((t * 0.45) % 1.2) - 0.1) * env.rows;
      const d = Math.abs(y - scan);
      if (d < 1.1) return hsl((x / env.cols) * 360, 100, 96);
      if (d < 2.6) return hsl((x / env.cols) * 360, 90, 46);
      return hsl((x / env.cols) * 360, 62, 28);
    },
  },
  {
    id: 'sparkle',
    name: 'sparkle',
    blurb: 'random glyphs flash and glitter',
    color(x, y, t) {
      const k = Math.floor(t * 6);
      if (h3(x, y, k) < 0.045) return hsl(h3(x, y, k + 5) * 360, 100, 78);
      return hsl(265, 35, 58 + h3(x, y, 3) * 12);
    },
    shadow() {
      return '0 0 .3em hsla(280,100%,80%,.4)';
    },
  },
  {
    id: 'typewriter',
    name: 'typewriter',
    blurb: 'the rainbow types itself in, loops',
    color(x, y, t, env) {
      const idx = y * env.cols + x;
      const prog = (t * 26) % (env.cols * env.rows + 40);
      if (idx < prog) return hsl(idx * 0.34 + t * 10, 100, 60); // one hue wrap across the grid
      return hsl(260, 30, 16);
    },
  },
  {
    id: 'fire',
    name: 'fire',
    blurb: 'heat crawling up from below',
    color(x, y, t, env) {
      const v = y / env.rows; // 1 at the bottom, where the fire is
      const f = h3(x, y, Math.floor(t * 10)) * 0.5;
      const heat = Math.min(1, Math.max(0, v - f + 0.15));
      return hsl(55 * heat, 100, 20 + heat * 70); // cool dark red → hot yellow
    },
  },
  {
    id: 'candy',
    name: 'candy',
    blurb: 'bubbly pastel stripes on the move',
    color(x, y, t, env) {
      // radial stripes — keeps it distinct from `full`'s diagonal
      return hsl(Math.hypot(x - env.cx, y - env.cy) * 9 + t * 24, 68, 76 + 6 * Math.sin(t * 2 + x * 0.4));
    },
  },
];

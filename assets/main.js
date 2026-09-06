// Rainbow bench — drives one live Mascot (vendored verbatim from
// xdxdxd.dsh.sh/site/assets/mascot.js) and paints its grid through 16
// rainbow effect views: a hero switcher plus a dashboard of tiles.

import { Mascot } from './mascot.js';
import { EFFECTS } from './effects.js';

const COLS = 46, ROWS = 23;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- grid source: one hidden live mascot, shared by every view ----------

const host = document.createElement('pre');
host.style.cssText = 'position:absolute;left:-9999px;top:0;margin:0';
document.body.appendChild(host);
const master = new Mascot(host, { cols: COLS, rows: ROWS, variant: 'smol', respectReducedMotion: true });

// forward hero pointer gestures to the live mascot so it still winks at visitors
const heroEl = document.getElementById('hero-mascot');
heroEl.addEventListener('pointerenter', () => master.setExpr({ eyeL: 'open', eyeR: 'wink', mouth: 'grin' }, 900));
heroEl.addEventListener('click', () => {
  master.setExpr({ eyeL: 'happy', eyeR: 'happy', mouth: 'grin' }, 1600);
  master.excitedUntil = performance.now() + 1600;
});

// ---------- view: char-span grid painted by an effect each frame ----------

class AsciiView {
  constructor(el, cols, rows) {
    this.el = el;
    this.cols = cols;
    this.rows = rows;
    this.env = { cols, rows, cx: cols / 2, cy: rows / 2 };
    this.rowEls = [];
    this.cells = []; // flat [row][col] spans
    this.text = [];  // last painted char per cell
    this.color = []; // last painted color string per cell (memoized writes)
    this.shiftCache = new Array(rows).fill(null);
    this.shadowCache = null;
    for (let y = 0; y < rows; y++) {
      const row = document.createElement('span');
      row.style.display = 'block';
      const line = [];
      for (let x = 0; x < cols; x++) {
        const s = document.createElement('span');
        s.textContent = ' ';
        row.appendChild(s);
        line.push(s);
      }
      el.appendChild(row);
      this.rowEls.push(row);
      this.cells.push(line);
      this.text.push([]);
      this.color.push([]);
    }
  }

  paint(rows, effect, t) {
    const { env } = this;
    const rowShift = effect.rowShift ?? null;
    if (effect.shadow) {
      const sh = effect.shadow(t, env);
      if (this.shadowCache !== sh) {
        this.shadowCache = sh;
        for (const row of this.rowEls) row.style.textShadow = sh;
      }
    }
    for (let y = 0; y < this.rows; y++) {
      const line = rows[y] ?? '';
      const rowEl = this.rowEls[y];
      if (rowShift) {
        const dy = Math.round(rowShift(y, t, env) * 4) / 4; // 0.25px steps so slow phases skip
        if (this.shiftCache[y] !== dy) {
          this.shiftCache[y] = dy;
          rowEl.style.transform = dy ? `translateY(${dy}px)` : '';
        }
      }
      for (let x = 0; x < this.cols; x++) {
        let ch = line[x] ?? ' ';
        if (ch !== ' ' && effect.char) {
          const rep = effect.char(x, y, t, ch, env);
          if (rep) ch = rep;
        }
        const span = this.cells[y][x];
        if (this.text[y][x] !== ch) {
          span.textContent = ch;
          this.text[y][x] = ch;
        }
        if (ch !== ' ') {
          const c = effect.color(x, y, t, env);
          if (this.color[y][x] !== c) {
            span.style.color = c;
            this.color[y][x] = c;
          }
        }
      }
    }
  }
}

// ---------- hero ----------

const heroView = new AsciiView(heroEl, COLS, ROWS);

const nameEl = document.getElementById('effect-name');
const blurbEl = document.getElementById('effect-blurb');
const chipsEl = document.getElementById('chips');
const speedEl = document.getElementById('speed');
const speedVal = document.getElementById('speed-val');
const autoEl = document.getElementById('auto');

let current = 0;
let tt = 0;
let speed = 1;
let auto = true;
let nextAutoFlip = 0;

const chips = EFFECTS.map((fx, i) => {
  const b = document.createElement('button');
  b.className = 'chip';
  b.textContent = fx.name;
  b.addEventListener('click', () => select(i, false));
  chipsEl.appendChild(b);
  return b;
});

function select(i, keepAuto = false) {
  current = (i + EFFECTS.length) % EFFECTS.length;
  if (!keepAuto) {
    auto = autoEl.checked;
  }
  const fx = EFFECTS[current];
  nameEl.textContent = fx.name;
  blurbEl.textContent = fx.blurb;
  chips.forEach((c, j) => c.classList.toggle('active', j === current));
  if (REDUCED) {
    const rows = master.prev;
    if (rows && rows.length) heroView.paint(rows, EFFECTS[current], 0);
  }
}

document.getElementById('prev').addEventListener('click', () => select(current - 1));
document.getElementById('next').addEventListener('click', () => select(current + 1));
document.getElementById('shuffle').addEventListener('click', () => {
  let i;
  do { i = Math.floor(Math.random() * EFFECTS.length); } while (i === current && EFFECTS.length > 1);
  select(i);
});
autoEl.addEventListener('change', () => { auto = autoEl.checked; });
speedEl.addEventListener('input', () => {
  speed = Number(speedEl.value) || 1;
  speedVal.textContent = `${speed.toFixed(2)}×`;
});

select(0, true);
autoEl.checked = true;

// ---------- dashboard tiles ----------

const grid = document.getElementById('grid');
const tiles = EFFECTS.map((fx, i) => {
  const tile = document.createElement('button');
  tile.className = 'tile';
  tile.title = `${fx.name} — ${fx.blurb}`;
  const pre = document.createElement('pre');
  pre.setAttribute('aria-hidden', 'true'); // the glyphs are decoration; the button's label carries the meaning
  const label = document.createElement('span');
  label.className = 'tile-label';
  label.textContent = fx.name;
  tile.append(pre, label);
  tile.setAttribute('aria-label', `${fx.name}: ${fx.blurb}`);
  tile.addEventListener('click', () => select(i, false));
  grid.appendChild(tile);
  return { fx, view: new AsciiView(pre, COLS, ROWS) };
});

// ---------- main loop: speed-scaled clock, hero every frame, tiles in two banks ----------

let last = performance.now();
let bank = 0;

// views scrolled offscreen stop being painted — the grid is where the frame
// budget goes, not the per-glyph math. the hero parks the same way.
const visible = tiles.map(() => true);
const heroFlag = { on: true };
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.target === heroEl) { heroFlag.on = e.isIntersecting; continue; }
    const i = tiles.findIndex((t) => t.view.el.parentElement === e.target);
    if (i >= 0) visible[i] = e.isIntersecting;
  }
}, { rootMargin: '80px' });
tiles.forEach((t) => io.observe(t.view.el.parentElement));
io.observe(heroEl);

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  tt += dt * speed;

  if (auto && now > nextAutoFlip) {
    select(current + 1, true);
    nextAutoFlip = now + 7000;
  }

  const rows = master.prev;
  if (rows && rows.length) {
    const fx = EFFECTS[current];
    if (heroFlag.on) heroView.paint(rows, fx, tt);
    for (let i = 0; i < tiles.length; i++) {
      if (visible[i] && (i & 1) === bank) tiles[i].view.paint(rows, tiles[i].fx, tt);
    }
    bank ^= 1;
  }
  if (!REDUCED) requestAnimationFrame(frame);
}

if (REDUCED) {
  const rows = master.prev;
  if (rows && rows.length) {
    EFFECTS.forEach((fx, i) => tiles[i].view.paint(rows, fx, 0));
    heroView.paint(rows, EFFECTS[current], 0);
  }
} else {
  requestAnimationFrame(frame);
}

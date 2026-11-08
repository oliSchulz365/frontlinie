'use strict';
/* =========================================================
   FRONTLINIE – Strategiekarte + Echtzeit-Schlachten
   Eigenständiges Spiel, läuft als PWA im Browser (iPad).
   ========================================================= */

const W = 1200, H = 900;
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
let scale = 1, offX = 0, offY = 0, dpr = 1;

function resize() {
  dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth, h = window.innerHeight;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  scale = Math.min(w / W, h / H);
  offX = (w - W * scale) / 2; offY = (h - H * scale) / 2;
}
window.addEventListener('resize', resize);
resize();

/* ---------- Konstanten ---------- */
const COL = { B: '#2f5fa8', R: '#b23a2c', N: '#8f8770' };
const COL_L = { B: '#7aa2e6', R: '#ec8572', N: '#cfc6aa' };
const FACTION = { B: 'Eisenbund', R: 'Kronland' };
const SHORT = { B: 'Blau', R: 'Rot' };
const other = p => (p === 'B' ? 'R' : 'B');
const MOVES = 3;
const CAP = { i: 8, c: 4, a: 3 };
const TYPE_NAME = { i: 'Infanterie', c: 'Kavallerie', a: 'Artillerie' };
const BATTLE_LIMIT = 180;
const FONT = '-apple-system, "Helvetica Neue", system-ui, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';

const REGIONS = [
  ['Nordfeld', 600, 150], ['Eisenhain', 300, 150], ['Kaltbrück', 900, 150],
  ['Weidenau', 180, 320], ['Steinfurt', 470, 320], ['Ostwacht', 730, 320], ['Seehafen', 1020, 320],
  ['Westgrat', 260, 450], ['Mittelmark', 600, 450], ['Rabenstein', 940, 450],
  ['Brandtal', 180, 580], ['Sonnhalde', 470, 580], ['Salzbucht', 730, 580], ['Glutheim', 1020, 580],
  ['Südmoor', 600, 750], ['Dornfeld', 300, 750], ['Glutbach', 900, 750]
];
const STATIONS = new Set([0, 14, 1, 16, 4, 12, 6, 10, 8]);
const CAPITAL = { B: 0, R: 14 };
const EDGES = [
  [0, 1], [0, 2], [0, 4], [0, 5], [1, 3], [1, 4], [2, 5], [2, 6], [3, 4], [4, 5], [5, 6],
  [3, 7], [4, 7], [4, 8], [5, 8], [5, 9], [6, 9], [7, 8], [8, 9],
  [7, 10], [7, 11], [8, 11], [8, 12], [9, 12], [9, 13], [10, 11], [11, 12], [12, 13],
  [10, 15], [11, 15], [11, 14], [12, 14], [12, 16], [13, 16], [14, 15], [14, 16]
];
const ADJ = REGIONS.map(() => []);
EDGES.forEach(([a, b]) => { ADJ[a].push(b); ADJ[b].push(a); });

const tot = a => a.i + a.c + a.a;
const power = a => a.i * 1 + a.c * 1.5 + a.a * 1.8;
const cloneA = a => ({ i: a.i, c: a.c, a: a.a });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (a, b) => a + Math.random() * (b - a);

function armyText(a) {
  const p = [];
  if (a.i) p.push(a.i + ' Infanterie');
  if (a.c) p.push(a.c + ' Kavallerie');
  if (a.a) p.push(a.a + ' Artillerie');
  return p.length ? p.join(' · ') : 'keine Truppen';
}
function mergeInto(dst, add) {
  const over = { i: 0, c: 0, a: 0 };
  for (const k of ['i', 'c', 'a']) {
    const s = dst[k] + add[k];
    dst[k] = Math.min(CAP[k], s);
    over[k] = s - dst[k];
  }
  return over;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* ---------- Sound (WebAudio, synthetisch) ---------- */
let AC = null, muted = false, lastShot = 0;
const noiseBuf = {};
function audio() {
  if (!AC) {
    try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; }
  }
  if (AC && AC.state === 'suspended') AC.resume();
}
function getNoise(dur) {
  if (noiseBuf[dur]) return noiseBuf[dur];
  const n = Math.floor(AC.sampleRate * dur);
  const buf = AC.createBuffer(1, n, AC.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.2);
  return (noiseBuf[dur] = buf);
}
function sfx(kind) {
  if (!AC || muted) return;
  const now = AC.currentTime;
  if (kind === 'shot') { if (now - lastShot < 0.05) return; lastShot = now; }
  const cfg = {
    shot: [0.18, 'highpass', 900, 0.12],
    boom: [0.9, 'lowpass', 260, 0.45],
    clash: [0.09, 'bandpass', 3200, 0.08],
    click: [0.04, 'bandpass', 1800, 0.06],
    horn: null
  }[kind];
  if (kind === 'horn') {
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(330, now); o.frequency.setValueAtTime(440, now + 0.18);
    o.frequency.setValueAtTime(554, now + 0.36);
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.07, now + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
    const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
    o.connect(f); f.connect(g); g.connect(AC.destination); o.start(now); o.stop(now + 0.75);
    return;
  }
  const [dur, type, freq, vol] = cfg;
  const src = AC.createBufferSource(); src.buffer = getNoise(dur);
  const f = AC.createBiquadFilter(); f.type = type; f.frequency.value = freq * rand(0.85, 1.15);
  const g = AC.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(AC.destination); src.start(now);
}

/* ---------- Zustand ---------- */
let screen = 'menu';      // menu | help | map | battle
let G = null;             // Spielstand Karte
let B = null;             // laufende Schlacht
let modal = null;         // {title, lines, buttons}
let banner = null;        // {text, sub, t}
let anim = null;          // Marschanimation auf der Karte
let sel = null;           // ausgewählte Region
let pendingBattle = null;
let ui = [];
const SAVE_KEY = 'frontlinie-save-v1';

function save() {
  try { if (G && !G.winner) localStorage.setItem(SAVE_KEY, JSON.stringify(G)); } catch (e) {}
}
function loadSave() {
  try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; }
}
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }

/* ---------- Spielablauf Karte ---------- */
function newGame(mode) {
  G = {
    mode, round: 1, cur: 'B', moves: MOVES, half: false, winner: null,
    regions: REGIONS.map(() => ({ owner: 'N', army: { i: 0, c: 0, a: 0 }, tired: false }))
  };
  for (const [p, ids] of [['B', [0, 1, 2]], ['R', [14, 15, 16]]]) {
    ids.forEach(id => {
      G.regions[id].owner = p;
      G.regions[id].army = id === CAPITAL[p] ? { i: 4, c: 2, a: 1 } : { i: 2, c: 0, a: 0 };
    });
  }
  screen = 'map'; sel = null; modal = null;
  startTurn();
}

function isCpuTurn() { return G && G.mode === 'cpu' && G.cur === 'R'; }

function startTurn() {
  const p = G.cur;
  let inf = 0, extra = [];
  G.regions.forEach((r, id) => {
    if (r.owner === p) {
      r.tired = false;
      if (STATIONS.has(id) && r.army.i < CAP.i) { r.army.i++; inf++; }
    }
  });
  const cap = G.regions[CAPITAL[p]];
  if (cap.owner === p) {
    if (G.round % 2 === 0 && cap.army.c < CAP.c) { cap.army.c++; extra.push('+1 Kavallerie'); }
    if (G.round % 3 === 0 && cap.army.a < CAP.a) { cap.army.a++; extra.push('+1 Artillerie'); }
  }
  G.moves = MOVES; sel = null;
  const sub = 'Nachschub: +' + inf + ' Infanterie' + (extra.length ? ', ' + extra.join(', ') : '');
  showBanner('Runde ' + G.round + ' · ' + FACTION[p] + ' (' + SHORT[p] + ') am Zug', sub);
  save();
  if (G.mode === 'hot') {
    modal = {
      title: FACTION[p] + ' (' + SHORT[p] + ') ist am Zug',
      lines: ['Runde ' + G.round + '. Gib das iPad an Spieler ' + SHORT[p] + ' weiter.', sub],
      buttons: [{ label: 'Los geht’s', fn: () => { modal = null; } }]
    };
  }
  if (isCpuTurn()) setTimeout(aiStep, 1200);
}

function endTurn() {
  if (G.winner) return;
  if (G.cur === 'R') G.round++;
  G.cur = other(G.cur);
  startTurn();
}

function doMove(src, dst, player, half) {
  const S = G.regions[src];
  let moving;
  if (half && tot(S.army) > 1) {
    moving = { i: Math.ceil(S.army.i / 2), c: Math.ceil(S.army.c / 2), a: Math.ceil(S.army.a / 2) };
    if (tot(moving) === tot(S.army)) { // nichts bliebe zurück -> eine Einheit zurückhalten
      for (const k of ['i', 'a', 'c']) if (moving[k] > 0) { moving[k]--; break; }
    }
  } else moving = cloneA(S.army);
  for (const k of ['i', 'c', 'a']) S.army[k] -= moving[k];
  G.moves--;
  sel = null;
  sfx('horn');
  anim = { src, dst, t: 0, dur: 0.7, owner: player, army: moving };
}

function resolveMove() {
  const { src, dst, owner, army } = anim;
  anim = null;
  const D = G.regions[dst];
  if (D.owner === owner) {
    const over = mergeInto(D.army, army);
    mergeInto(G.regions[src].army, over);
    D.tired = true;
    afterAction();
  } else if (tot(D.army) === 0) {
    D.owner = owner; D.army = army; D.tired = true;
    showBanner(REGIONS[dst][0] + ' erobert', FACTION[owner] + ' übernimmt das Gebiet kampflos.');
    if (!checkWin()) afterAction();
  } else {
    pendingBattle = { src, dst, att: owner, attArmy: army, defArmy: cloneA(D.army), def: D.owner };
    const human = G.mode === 'hot' || owner === 'B' || D.owner === 'B';
    modal = {
      title: 'Schlacht um ' + REGIONS[dst][0] + '!',
      lines: [
        'Angreifer: ' + FACTION[owner] + ' – ' + armyText(army),
        'Verteidiger: ' + FACTION[D.owner] + ' – ' + armyText(D.army),
        'Blau kämpft links, Rot rechts. Nach 3 Minuten hält der Verteidiger das Gebiet.'
      ],
      buttons: [
        { label: 'Selbst kämpfen', fn: () => { modal = null; startBattle(); } },
        { label: 'Automatisch berechnen', fn: () => { modal = null; autoResolve(); } }
      ]
    };
    if (!human) { modal = null; autoResolve(); }
  }
}

function afterAction() {
  save();
  if (isCpuTurn() && !G.winner) setTimeout(aiStep, 650);
}

function checkWin() {
  for (const p of ['B', 'R']) {
    const e = other(p);
    const lostCapital = G.regions[CAPITAL[e]].owner === p;
    const noLand = !G.regions.some(r => r.owner === e);
    if (lostCapital || noLand) {
      G.winner = p; clearSave();
      const youWon = G.mode === 'hot' || p === 'B';
      modal = {
        title: youWon ? 'Sieg für ' + FACTION[p] + '!' : 'Niederlage',
        lines: [
          lostCapital ? 'Die Hauptstadt ' + REGIONS[CAPITAL[e]][0] + ' ist gefallen.' : FACTION[e] + ' hat kein Gebiet mehr.',
          'Das Spiel endet in Runde ' + G.round + '.'
        ],
        buttons: [{ label: 'Zum Hauptmenü', fn: () => { modal = null; G = null; screen = 'menu'; } }]
      };
      return true;
    }
  }
  return false;
}

function applyBattleResult(winner, surv, timeout) {
  const pb = pendingBattle; pendingBattle = null;
  const D = G.regions[pb.dst];
  const name = REGIONS[pb.dst][0];
  let text;
  if (winner === pb.att) {
    D.owner = pb.att; D.army = surv[pb.att]; D.tired = true;
    text = FACTION[pb.att] + ' erobert ' + name + '.';
  } else {
    D.army = surv[pb.def];
    const back = surv[pb.att];
    if (tot(back) > 0) mergeInto(G.regions[pb.src].army, back);
    text = FACTION[pb.def] + ' hält ' + name + (timeout ? ' (Zeit abgelaufen, der Angreifer zieht sich zurück).' : '.');
  }
  screen = 'map';
  const won = checkWin();
  if (!won) {
    modal = {
      title: winner === pb.att ? 'Gebiet erobert' : 'Angriff abgewehrt',
      lines: [text,
        'Überlebende ' + FACTION.B + ': ' + armyText(surv.B),
        'Überlebende ' + FACTION.R + ': ' + armyText(surv.R)],
      buttons: [{ label: 'Weiter', fn: () => { modal = null; afterAction(); } }]
    };
  }
}

function autoResolve() {
  const pb = pendingBattle;
  const A = cloneA(pb.attArmy), D = cloneA(pb.defArmy);
  const pa = power(A) * rand(0.75, 1.25), pd = power(D) * 1.1 * rand(0.75, 1.25);
  const attWins = pa > pd;
  const win = attWins ? A : D, lose = attWins ? D : A;
  const lossFrac = clamp((Math.min(pa, pd) / Math.max(pa, pd)) * 0.7, 0.05, 0.9);
  let losses = Math.round(tot(win) * lossFrac);
  while (losses > 0 && tot(win) > 1) {
    const ks = ['i', 'c', 'a'].filter(k => win[k] > 0);
    const k = ks[Math.floor(Math.random() * ks.length)];
    win[k]--; losses--;
  }
  lose.i = lose.c = lose.a = 0;
  const surv = {}; surv[pb.att] = A; surv[pb.def] = D;
  applyBattleResult(attWins ? pb.att : pb.def, surv, false);
}

/* ---------- Computergegner (Karte) ---------- */
function aiChoose() {
  const me = 'R';
  let best = null;
  G.regions.forEach((r, id) => {
    if (r.owner !== me || r.tired || tot(r.army) === 0) return;
    const enemyNear = ADJ[id].some(n => G.regions[n].owner === 'B' && tot(G.regions[n].army) > 0);
    for (const n of ADJ[id]) {
      const T = G.regions[n];
      let score = 0, half = false;
      if (T.owner !== me && tot(T.army) === 0) {
        score = 12 + (STATIONS.has(n) ? 8 : 0) + (n === CAPITAL.B ? 200 : 0);
        half = tot(r.army) > 2;
      } else if (T.owner === 'B') {
        const ratio = power(r.army) / power(T.army);
        if (ratio > 1.25) score = 15 * ratio + (n === CAPITAL.B ? 200 : 0) + (STATIONS.has(n) ? 5 : 0);
      } else if (T.owner === me) {
        const frontT = ADJ[n].some(m => G.regions[m].owner !== me);
        if (frontT && !enemyNear && tot(r.army) > 1) score = 4 + tot(r.army) * 0.3;
      }
      if (id === CAPITAL.R && enemyNear) half = true;
      score += Math.random() * 3;
      if (score > 3 && (!best || score > best.score)) best = { src: id, dst: n, score, half };
    }
  });
  return best;
}
function aiStep() {
  if (!G || !isCpuTurn() || G.winner || screen !== 'map') return;
  if (modal || anim) return;
  if (G.moves <= 0) { endTurn(); return; }
  const m = aiChoose();
  if (!m) { endTurn(); return; }
  doMove(m.src, m.dst, 'R', m.half);
}

/* ---------- Karte: Eingabe ---------- */
function regionAt(p) {
  for (let i = 0; i < REGIONS.length; i++) {
    if (Math.hypot(p.x - REGIONS[i][1], p.y - REGIONS[i][2]) < 44) return i;
  }
  return -1;
}
function canSelect(id) {
  const r = G.regions[id];
  return r.owner === G.cur && !r.tired && tot(r.army) > 0;
}
function mapTap(p) {
  if (!G || anim || isCpuTurn() || G.winner) return;
  const id = regionAt(p);
  if (id < 0) { sel = null; return; }
  sfx('click');
  if (sel === null) { if (canSelect(id)) sel = id; return; }
  if (id === sel) { sel = null; return; }
  if (ADJ[sel].includes(id) && G.moves > 0) { doMove(sel, id, G.cur, G.half); return; }
  sel = canSelect(id) ? id : null;
}

/* ---------- Schlacht ---------- */
const UT = {
  i: { hp: 100, spd: 40, rng: 190, dmg: 10, rel: 1.5 },
  c: { hp: 110, spd: 100, rng: 30, dmg: 15, rel: 0.8 },
  a: { hp: 80, spd: 24, rng: 430, min: 80, dmg: 34, splash: 55, rel: 4.2 }
};
const FIELD = { x0: 20, x1: 1180, y0: 82, y1: 812 };
let uid = 0;

function startBattle() {
  const pb = pendingBattle;
  const armies = {};
  armies[pb.att] = pb.attArmy; armies[pb.def] = pb.defArmy;
  B = {
    t: 0, units: [], fx: [], shells: [], over: false, paused: false,
    ai: G.mode === 'cpu' ? { R: true } : {},
    sel: { B: [], R: [] }, lastSel: null, drags: new Map(),
    name: REGIONS[pb.dst][0], def: pb.def, att: pb.att,
    bg: makeBattleBg(pb.dst)
  };
  deploy('B', armies.B); deploy('R', armies.R);
  screen = 'battle';
  sfx('horn');
  showBanner('Schlacht um ' + B.name, G.mode === 'cpu'
    ? 'Einheit antippen, dann Ziel antippen – oder Einheit direkt zum Ziel ziehen.'
    : 'Blau links, Rot rechts. Angriff: eigene Einheit auf den Gegner ziehen.');
}

function deploy(side, army) {
  const mx = x => (side === 'B' ? x : W - x);
  const col = (n, x, y0, y1) => {
    const out = [];
    for (let k = 0; k < n; k++) out.push([x, n === 1 ? (y0 + y1) / 2 : y0 + (y1 - y0) * k / (n - 1)]);
    return out;
  };
  const add = (type, x, y) => {
    B.units.push({
      id: uid++, side, type, x: mx(x), y, hp: UT[type].hp, max: UT[type].hp,
      cd: rand(0.3, 1.5), order: null, tx: 0, ty: 0, target: null, auto: false, think: 0,
      face: side === 'B' ? 0 : Math.PI
    });
  };
  const ni = army.i, span = Math.min(560, 70 * Math.max(1, ni - 1));
  col(ni, 260, 447 - span / 2, 447 + span / 2).forEach(([x, y]) => add('i', x, y));
  const na = army.a, sa = Math.min(400, 120 * Math.max(1, na - 1));
  col(na, 100, 447 - sa / 2, 447 + sa / 2).forEach(([x, y]) => add('a', x, y));
  const nc = army.c;
  for (let k = 0; k < nc; k++) {
    const top = k % 2 === 0, row = Math.floor(k / 2);
    add('c', 190 + row * 45, top ? 150 + row * 20 : 744 - row * 20);
  }
}

function alive(side) { return B.units.filter(u => u.hp > 0 && (!side || u.side === side)); }
function enemiesOf(u) { return B.units.filter(e => e.hp > 0 && e.side !== u.side); }
function nearest(u, list) {
  let best = null, bd = 1e9;
  for (const e of list) { const d = dist(u, e); if (d < bd) { bd = d; best = e; } }
  return best;
}

function autoCommand(u) {
  const en = enemiesOf(u);
  if (!en.length) return;
  u.order = null;
  if (u.type === 'c') {
    const arts = en.filter(e => e.type === 'a');
    if (arts.length && Math.random() < 0.75) { u.target = nearest(u, arts); return; }
    const close = en.slice().sort((a, b) => dist(u, a) - dist(u, b)).slice(0, 3);
    u.target = close.sort((a, b) => a.hp - b.hp)[0];
    return;
  }
  u.target = nearest(u, en);
}

function battleUpdate(dt) {
  if (B.over || B.paused) return;
  B.t += dt;
  const units = B.units;
  for (const u of units) {
    if (u.hp <= 0) continue;
    const st = UT[u.type];
    u.cd -= dt;
    if ((B.ai[u.side] && B.t > 2) || u.auto) {
      u.think -= dt;
      if (u.think <= 0) {
        u.think = rand(0.6, 1.1);
        const keep = u.target && u.target.hp > 0 && u.type !== 'c' && dist(u, u.target) <= st.rng;
        if (!keep) autoCommand(u);
      }
    }
    if (u.target && u.target.hp <= 0) u.target = null;
    let moving = false;
    let mvx = 0, mvy = 0;
    if (u.order === 'move') {
      const dx = u.tx - u.x, dy = u.ty - u.y, d = Math.hypot(dx, dy);
      if (d > 4) { mvx = dx / d; mvy = dy / d; moving = true; } else u.order = null;
    } else if (u.target) {
      const d = dist(u, u.target);
      const want = u.type === 'c' ? st.rng * 0.7 : st.rng * 0.9;
      if (d > want) { mvx = (u.target.x - u.x) / d; mvy = (u.target.y - u.y) / d; moving = true; }
    }
    if (moving) {
      u.x += mvx * st.spd * dt; u.y += mvy * st.spd * dt;
      u.face = Math.atan2(mvy, mvx);
    }
    if (!moving || u.type === 'c') {
      let f = null;
      if (u.target) {
        const d = dist(u, u.target);
        if (d <= st.rng && (!st.min || d >= st.min)) f = u.target;
      }
      if (!f) {
        let bd = 1e9;
        for (const e of units) {
          if (e.hp <= 0 || e.side === u.side) continue;
          const d = dist(u, e);
          if (d <= st.rng && (!st.min || d >= st.min) && d < bd) { bd = d; f = e; }
        }
      }
      if (f) {
        if (!moving) u.face = Math.atan2(f.y - u.y, f.x - u.x);
        if (u.cd <= 0) { fire(u, f); u.cd = st.rel * rand(0.85, 1.15); }
      } else if (!moving && !u.order && u.type === 'c') {
        const e = nearest(u, enemiesOf(u));
        if (e && dist(u, e) < 170) u.target = e;
      }
    }
  }
  // Abstand halten
  for (let a = 0; a < units.length; a++) {
    const u = units[a]; if (u.hp <= 0) continue;
    for (let b = a + 1; b < units.length; b++) {
      const v = units[b]; if (v.hp <= 0) continue;
      const dx = v.x - u.x, dy = v.y - u.y, d = Math.hypot(dx, dy) || 0.01;
      const minD = (u.side === v.side ? 44 : 32);
      if (d < minD) {
        const push = (minD - d) * 0.5, nx = dx / d, ny = dy / d;
        u.x -= nx * push; u.y -= ny * push; v.x += nx * push; v.y += ny * push;
      }
    }
    u.x = clamp(u.x, FIELD.x0, FIELD.x1); u.y = clamp(u.y, FIELD.y0, FIELD.y1);
  }
  // Granaten
  for (const s of B.shells) {
    s.t += dt;
    if (s.t >= s.dur && !s.done) {
      s.done = true;
      explode(s);
    }
  }
  B.shells = B.shells.filter(s => !s.done);
  // Effekte
  for (const f of B.fx) f.t += dt;
  B.fx = B.fx.filter(f => f.t < f.life);
  for (const side of ['B', 'R']) B.sel[side] = B.sel[side].filter(u => u.hp > 0);
  // Ende?
  const nb = alive('B').length, nr = alive('R').length;
  if (nb === 0 || nr === 0 || B.t >= BATTLE_LIMIT) {
    B.over = true;
    const timeout = nb > 0 && nr > 0;
    const winner = timeout ? B.def : (nb > 0 ? 'B' : 'R');
    const surv = { B: { i: 0, c: 0, a: 0 }, R: { i: 0, c: 0, a: 0 } };
    for (const u of alive()) surv[u.side][u.type]++;
    setTimeout(() => {
      const humanSide = G.mode === 'cpu' ? 'B' : null;
      modal = {
        title: humanSide ? (winner === humanSide ? 'Sieg!' : 'Niederlage') : FACTION[winner] + ' gewinnt die Schlacht',
        lines: [timeout ? 'Die Zeit ist abgelaufen – der Verteidiger behauptet sich.' : FACTION[other(winner)] + ' ist vom Feld vertrieben.'],
        buttons: [{ label: 'Zur Karte', fn: () => { modal = null; B = null; applyBattleResult(winner, surv, timeout); } }]
      };
    }, 1200);
  }
}

function damage(f, amt) {
  if (f.hp <= 0) return;
  f.hp -= amt;
  if (f.hp <= 0) {
    f.hp = 0;
    const g = B.bg.getContext('2d');
    g.fillStyle = 'rgba(70,40,25,0.35)';
    g.beginPath(); g.ellipse(f.x, f.y, 16, 9, Math.random() * 3, 0, Math.PI * 2); g.fill();
    g.fillStyle = f.side === 'B' ? 'rgba(47,95,168,0.55)' : 'rgba(178,58,44,0.55)';
    for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(f.x + rand(-9, 9), f.y + rand(-6, 6), 3, 0, 6.3); g.fill(); }
  }
}

function fire(u, f) {
  const st = UT[u.type];
  const d = dist(u, f);
  if (u.type === 'i') {
    const ex = f.x + rand(-8, 8), ey = f.y + rand(-8, 8);
    B.fx.push({ k: 'tracer', x: u.x, y: u.y, x2: ex, y2: ey, t: 0, life: 0.12 });
    B.fx.push({ k: 'smoke', x: u.x + Math.cos(u.face) * 12, y: u.y + Math.sin(u.face) * 12, t: 0, life: 1.6, r: 6 });
    if (Math.random() < 0.8) {
      const mult = (f.type === 'c' ? 1.25 : 1) * (1 - 0.4 * d / st.rng);
      damage(f, st.dmg * rand(0.7, 1.3) * mult);
    }
    sfx('shot');
  } else if (u.type === 'c') {
    const mult = f.type === 'a' ? 1.6 : (f.type === 'i' ? 0.85 : 1);
    damage(f, st.dmg * rand(0.8, 1.2) * mult);
    B.fx.push({ k: 'spark', x: (u.x + f.x) / 2, y: (u.y + f.y) / 2, t: 0, life: 0.25 });
    sfx('clash');
  } else {
    B.shells.push({
      side: u.side, x: u.x + Math.cos(u.face) * 18, y: u.y + Math.sin(u.face) * 18,
      tx: f.x + rand(-28, 28), ty: f.y + rand(-28, 28), t: 0, dur: d / 420 + 0.35
    });
    B.fx.push({ k: 'smoke', x: u.x + Math.cos(u.face) * 20, y: u.y + Math.sin(u.face) * 20, t: 0, life: 2.2, r: 12 });
    sfx('boom');
  }
}

function explode(s) {
  const st = UT.a;
  B.fx.push({ k: 'boom', x: s.tx, y: s.ty, t: 0, life: 0.5 });
  B.fx.push({ k: 'smoke', x: s.tx, y: s.ty, t: 0, life: 2.5, r: 16 });
  const g = B.bg.getContext('2d');
  g.fillStyle = 'rgba(60,45,30,0.25)';
  g.beginPath(); g.arc(s.tx, s.ty, 12, 0, 6.3); g.fill();
  for (const e of B.units) {
    if (e.hp <= 0 || e.side === s.side) continue;
    const d = Math.hypot(e.x - s.tx, e.y - s.ty);
    if (d < st.splash) damage(e, st.dmg * (1 - 0.6 * d / st.splash) * rand(0.8, 1.2));
  }
  sfx('boom');
}

/* ---------- Schlacht: Eingabe ---------- */
function controllable(side) { return !B.ai[side]; }
function unitAt(p) {
  let best = null, bd = 38;
  for (const u of B.units) {
    if (u.hp <= 0) continue;
    const d = Math.hypot(u.x - p.x, u.y - p.y);
    if (d < bd) { bd = d; best = u; }
  }
  return best;
}
function battleDown(id, p) {
  if (B.over) return;
  const u = unitAt(p);
  B.drags.set(id, { x0: p.x, y0: p.y, x: p.x, y: p.y, unit: u && controllable(u.side) ? u : null, hit: u });
}
function battleMove(id, p) {
  const d = B.drags.get(id);
  if (d) { d.x = p.x; d.y = p.y; }
}
function battleUp(id, p) {
  const d = B.drags.get(id);
  if (!d) return;
  B.drags.delete(id);
  if (B.over) return;
  const moved = Math.hypot(p.x - d.x0, p.y - d.y0) > 25;
  if (moved && d.unit) {
    const side = d.unit.side;
    const group = B.sel[side].includes(d.unit) ? B.sel[side] : [d.unit];
    issueOrder(group, p);
    return;
  }
  if (moved) return;
  const u = d.hit, ls = B.lastSel;
  if (u) {
    // Im 1-Spieler-Modus: Gegner antippen = Angriff
    if (!controllable(u.side) && ls && B.sel[ls].length) { issueOrder(B.sel[ls], p, u); return; }
    if (controllable(u.side)) toggleSel(u);
    return;
  }
  if (ls && B.sel[ls].length) issueOrder(B.sel[ls], p);
}
function toggleSel(u) {
  const arr = B.sel[u.side];
  const i = arr.indexOf(u);
  if (i >= 0) arr.splice(i, 1); else arr.push(u);
  B.lastSel = u.side;
  sfx('click');
}
function issueOrder(group, p, tgt) {
  if (!group.length) return;
  const side = group[0].side;
  if (!tgt) {
    const h = unitAt(p);
    if (h && h.side !== side) tgt = h;
  }
  if (tgt) {
    group.forEach(u => { u.target = tgt; u.order = null; u.auto = false; });
    B.fx.push({ k: 'ping', x: tgt.x, y: tgt.y, t: 0, life: 0.6, c: '#ff5a3c' });
  } else {
    const cx = group.reduce((s, u) => s + u.x, 0) / group.length;
    const cy = group.reduce((s, u) => s + u.y, 0) / group.length;
    group.forEach(u => {
      u.order = 'move'; u.target = null; u.auto = false;
      u.tx = clamp(p.x + (u.x - cx) * 0.7, FIELD.x0, FIELD.x1);
      u.ty = clamp(p.y + (u.y - cy) * 0.7, FIELD.y0, FIELD.y1);
    });
    B.fx.push({ k: 'ping', x: p.x, y: p.y, t: 0, life: 0.6, c: '#ffe27a' });
  }
  sfx('click');
}
function selectAll(side) {
  B.sel[side] = alive(side);
  B.lastSel = side;
}
function chargeAll(side) {
  alive(side).forEach(u => { u.auto = true; u.think = 0; u.order = null; });
  sfx('horn');
  showBanner(FACTION[side] + ': Sturmangriff!', '');
}

/* ---------- Pointer ---------- */
function toLogical(e) {
  const r = cv.getBoundingClientRect();
  return { x: (e.clientX - r.left - offX) / scale, y: (e.clientY - r.top - offY) / scale };
}
cv.addEventListener('pointerdown', e => {
  e.preventDefault();
  audio();
  const p = toLogical(e);
  for (let i = ui.length - 1; i >= 0; i--) {
    const b = ui[i];
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) { sfx('click'); b.fn(); return; }
  }
  if (modal) return;
  if (screen === 'map') mapTap(p);
  else if (screen === 'battle' && B) battleDown(e.pointerId, p);
  else if (screen === 'help') screen = 'menu';
});
cv.addEventListener('pointermove', e => { if (screen === 'battle' && B) battleMove(e.pointerId, toLogical(e)); });
const up = e => { if (screen === 'battle' && B) battleUp(e.pointerId, toLogical(e)); };
cv.addEventListener('pointerup', up);
cv.addEventListener('pointercancel', e => { if (B) B.drags.delete(e.pointerId); });
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('contextmenu', e => e.preventDefault());

/* ---------- Grafik: Hilfen ---------- */
function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function button(x, y, w, h, label, fn, style) {
  const s = style || {};
  ctx.save();
  rr(x, y, w, h, 12);
  ctx.fillStyle = s.disabled ? 'rgba(80,80,80,0.6)' : (s.bg || '#e9dcb8');
  ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = s.border || '#3a2e1d'; ctx.stroke();
  ctx.fillStyle = s.disabled ? '#bbb' : (s.fg || '#2b2316');
  ctx.font = '600 ' + (s.size || 22) + 'px ' + FONT;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
  ctx.restore();
  if (!s.disabled) ui.push({ x, y, w, h, fn });
}
function text(t, x, y, size, color, align, weight, font) {
  ctx.font = (weight || '500') + ' ' + size + 'px ' + (font || FONT);
  ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(t, x, y);
}
function wrap(t, x, y, maxW, size, color, lh) {
  ctx.font = '500 ' + size + 'px ' + FONT;
  ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  const words = t.split(' ');
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, y); y += lh; line = w; } else line = test;
  }
  if (line) { ctx.fillText(line, x, y); y += lh; }
  return y;
}
function showBanner(t, sub) { banner = { text: t, sub: sub || '', t: 0 }; }

/* ---------- Karten-Hintergrund ---------- */
const mapBg = document.createElement('canvas');
function makeMapBg() {
  mapBg.width = W; mapBg.height = H;
  const g = mapBg.getContext('2d');
  const R = mulberry32(7);
  g.fillStyle = '#6f97a8'; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 2;
  for (let k = 0; k < 70; k++) {
    const x = R() * W, y = R() * H;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 10, y - 5, x + 20, y); g.stroke();
  }
  // Landmasse
  const pts = [];
  for (let k = 0; k < 64; k++) {
    const a = k / 64 * Math.PI * 2;
    const rx = 575 + Math.sin(a * 5) * 18 + (R() - 0.5) * 26;
    const ry = 395 + Math.cos(a * 4) * 16 + (R() - 0.5) * 26;
    pts.push([600 + Math.cos(a) * rx, 450 + Math.sin(a) * ry]);
  }
  g.beginPath();
  pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fillStyle = '#e6d9a8'; g.fill();
  g.save(); g.clip();
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#c9cf98'); grd.addColorStop(0.5, '#d9cf98'); grd.addColorStop(1, '#d8b98a');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  for (let k = 0; k < 140; k++) {
    g.fillStyle = 'rgba(120,140,70,' + (0.05 + R() * 0.08) + ')';
    g.beginPath(); g.arc(R() * W, R() * H, 20 + R() * 50, 0, 6.3); g.fill();
  }
  // Fluss
  g.strokeStyle = '#7ea7b8'; g.lineWidth = 14; g.lineCap = 'round';
  g.beginPath(); g.moveTo(10, 395);
  g.bezierCurveTo(300, 360, 420, 430, 600, 385);
  g.bezierCurveTo(780, 340, 900, 420, 1190, 380); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 3; g.stroke();
  // Wälder & Berge
  const nearNode = (x, y, r) => REGIONS.some(n => Math.hypot(n[1] - x, n[2] - y) < r);
  for (let k = 0; k < 40; k++) {
    const cx = 80 + R() * 1040, cy = 90 + R() * 720;
    if (nearNode(cx, cy, 80)) continue;
    for (let j = 0; j < 9; j++) {
      g.fillStyle = j % 2 ? '#5f7d43' : '#4e6b37';
      g.beginPath(); g.arc(cx + (R() - 0.5) * 50, cy + (R() - 0.5) * 30, 7 + R() * 5, 0, 6.3); g.fill();
    }
  }
  for (let k = 0; k < 18; k++) {
    const cx = 80 + R() * 1040, cy = 90 + R() * 720;
    if (nearNode(cx, cy, 75)) continue;
    g.fillStyle = '#9b9283'; g.beginPath(); g.moveTo(cx - 18, cy + 12); g.lineTo(cx, cy - 16); g.lineTo(cx + 18, cy + 12); g.fill();
    g.fillStyle = '#f2efe6'; g.beginPath(); g.moveTo(cx - 5, cy - 8); g.lineTo(cx, cy - 16); g.lineTo(cx + 5, cy - 8); g.fill();
  }
  g.restore();
  g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
  g.strokeStyle = '#8a7a52'; g.lineWidth = 3; g.stroke();
}
makeMapBg();

/* ---------- Schlacht-Hintergrund ---------- */
function makeBattleBg(seed) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const R = mulberry32(seed * 977 + 13);
  g.fillStyle = '#7d9a52'; g.fillRect(0, 0, W, H);
  for (let k = 0; k < 220; k++) {
    g.fillStyle = R() < 0.5 ? 'rgba(60,90,35,0.12)' : 'rgba(170,170,90,0.12)';
    g.beginPath(); g.ellipse(R() * W, R() * H, 20 + R() * 60, 10 + R() * 30, R() * 3, 0, 6.3); g.fill();
  }
  // Feldweg
  g.strokeStyle = 'rgba(150,120,80,0.6)'; g.lineWidth = 22; g.lineCap = 'round';
  g.beginPath(); g.moveTo(0, 300 + R() * 300);
  g.bezierCurveTo(400, 200 + R() * 500, 800, 200 + R() * 500, W, 300 + R() * 300); g.stroke();
  // Bäume am Rand und vereinzelt
  for (let k = 0; k < 26; k++) {
    let x = 340 + R() * 520, y = 100 + R() * 700;
    if (k < 14) { x = R() * W; y = R() < 0.5 ? 90 + R() * 30 : 790 + R() * 30; }
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(x + 6, y + 6, 15, 10, 0, 0, 6.3); g.fill();
    g.fillStyle = '#3f5f2d'; g.beginPath(); g.arc(x, y, 14, 0, 6.3); g.fill();
    g.fillStyle = '#56783a'; g.beginPath(); g.arc(x - 4, y - 4, 8, 0, 6.3); g.fill();
  }
  // Zäune
  g.strokeStyle = '#6b5131'; g.lineWidth = 3;
  for (let k = 0; k < 4; k++) {
    const x = 380 + R() * 440, y = 160 + R() * 580, len = 60 + R() * 80;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y + (R() - 0.5) * 30); g.stroke();
  }
  return c;
}

/* ---------- Zeichnen: Karte ---------- */
function drawRail(x1, y1, x2, y2) {
  ctx.strokeStyle = '#3b3127'; ctx.lineWidth = 7; ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.strokeStyle = '#d9c9a0'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.setLineDash([]);
}
function drawTrain(x, y) {
  ctx.fillStyle = '#2a2420';
  rr(x - 11, y - 7, 22, 11, 3); ctx.fill();
  ctx.fillRect(x + 4, y - 12, 5, 6);
  ctx.fillStyle = '#f0e2b6';
  ctx.beginPath(); ctx.arc(x - 6, y + 5, 3, 0, 6.3); ctx.arc(x + 6, y + 5, 3, 0, 6.3); ctx.fill();
}
function drawStar(x, y, r, col) {
  ctx.fillStyle = col; ctx.strokeStyle = '#3a2e1d'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + k * Math.PI / 5, rad = k % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
}

function drawMapScene(interactive) {
  ctx.drawImage(mapBg, 0, 0);
  if (!G) return;
  const time = performance.now() / 1000;
  for (const [a, b] of EDGES) {
    const A = REGIONS[a], Bn = REGIONS[b];
    if (STATIONS.has(a) && STATIONS.has(b)) drawRail(A[1], A[2], Bn[1], Bn[2]);
    else {
      ctx.strokeStyle = 'rgba(110,80,45,0.75)'; ctx.lineWidth = 4; ctx.setLineDash([10, 7]);
      ctx.beginPath(); ctx.moveTo(A[1], A[2]); ctx.lineTo(Bn[1], Bn[2]); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  if (interactive && sel !== null) {
    ctx.strokeStyle = 'rgba(255,240,150,' + (0.6 + 0.4 * Math.sin(time * 6)) + ')';
    ctx.lineWidth = 6;
    for (const n of ADJ[sel]) {
      ctx.beginPath(); ctx.moveTo(REGIONS[sel][1], REGIONS[sel][2]); ctx.lineTo(REGIONS[n][1], REGIONS[n][2]); ctx.stroke();
    }
  }
  REGIONS.forEach(([name, x, y], id) => {
    const r = G.regions[id];
    const isTarget = interactive && sel !== null && ADJ[sel].includes(id);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.arc(x + 3, y + 4, 34, 0, 6.3); ctx.fill();
    ctx.fillStyle = COL[r.owner];
    ctx.beginPath(); ctx.arc(x, y, 34, 0, 6.3); ctx.fill();
    ctx.lineWidth = id === sel ? 6 : 3;
    ctx.strokeStyle = id === sel ? '#ffe27a' : (isTarget ? 'rgba(255,255,255,' + (0.6 + 0.4 * Math.sin(time * 6)) + ')' : '#2b2316');
    ctx.stroke();
    if (isTarget) {
      ctx.strokeStyle = 'rgba(255,240,150,0.5)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, 40 + 3 * Math.sin(time * 6), 0, 6.3); ctx.stroke();
    }
    const t = tot(r.army);
    if (t > 0) {
      const dim = r.tired && r.owner === G.cur;
      text(String(t), x, y + 1, 30, dim ? 'rgba(255,255,255,0.45)' : '#fff', 'center', '700');
      const comp = r.army.i + ' I · ' + r.army.c + ' K · ' + r.army.a + ' A';
      ctx.font = '600 13px ' + FONT;
      const w = ctx.measureText(comp).width + 14;
      ctx.fillStyle = 'rgba(30,24,16,0.8)'; rr(x - w / 2, y + 38, w, 20, 8); ctx.fill();
      text(comp, x, y + 48, 13, '#f3e9cf', 'center', '600');
    }
    text(name, x, y - 46, 16, '#2b2316', 'center', '700');
    if (STATIONS.has(id)) drawTrain(x + 30, y - 26);
    if (id === CAPITAL.B || id === CAPITAL.R) drawStar(x - 30, y - 26, 13, '#f2c640');
  });
  if (anim) {
    const k = clamp(anim.t / anim.dur, 0, 1);
    const ax = REGIONS[anim.src][1] + (REGIONS[anim.dst][1] - REGIONS[anim.src][1]) * k;
    const ay = REGIONS[anim.src][2] + (REGIONS[anim.dst][2] - REGIONS[anim.src][2]) * k;
    ctx.fillStyle = '#2b2316'; ctx.fillRect(ax - 2, ay - 30, 4, 34);
    ctx.fillStyle = COL[anim.owner];
    ctx.beginPath(); ctx.moveTo(ax + 2, ay - 30); ctx.lineTo(ax + 30, ay - 22); ctx.lineTo(ax + 2, ay - 14); ctx.fill();
    text(String(tot(anim.army)), ax + 12, ay - 22, 12, '#fff', 'center', '700');
  }
}

function drawMap() {
  drawMapScene(true);
  // Kopfzeile
  ctx.fillStyle = 'rgba(29,42,36,0.88)'; ctx.fillRect(0, 0, W, 58);
  const cnt = p => G.regions.filter(r => r.owner === p).length;
  text('Runde ' + G.round, 20, 29, 22, '#f3e9cf', 'left', '700');
  ctx.fillStyle = COL[G.cur]; ctx.beginPath(); ctx.arc(170, 29, 11, 0, 6.3); ctx.fill();
  text(FACTION[G.cur] + ' am Zug' + (isCpuTurn() ? ' (Computer)' : ''), 190, 29, 22, '#f3e9cf', 'left', '600');
  text('Blau ' + cnt('B') + ' Gebiete  ·  Rot ' + cnt('R') + ' Gebiete', 1080, 29, 18, '#cfc6aa', 'right', '500');
  button(1096, 9, 90, 40, muted ? '🔇' : '🔊', () => { muted = !muted; }, { size: 20 });
  // Fußzeile
  ctx.fillStyle = 'rgba(29,42,36,0.88)'; ctx.fillRect(0, 822, W, 78);
  if (isCpuTurn()) {
    text('Der Computer plant seine Züge …', 20, 861, 20, '#f3e9cf', 'left', '600');
  } else {
    text('Züge übrig: ' + G.moves + ' / ' + MOVES, 20, 848, 20, '#f3e9cf', 'left', '700');
    const hint = sel !== null
      ? 'Ausgewählt: ' + REGIONS[sel][0] + ' – ' + armyText(G.regions[sel].army) + '. Ziel antippen.'
      : (G.moves > 0 ? 'Tippe eine eigene Armee an.' : 'Keine Züge mehr – Zug beenden.');
    wrap(hint, 20, 864, 560, 15, '#cfc6aa', 18);
    button(610, 834, 210, 54, G.half ? 'Halbe Armee' : 'Ganze Armee', () => { G.half = !G.half; }, { bg: G.half ? '#f2c640' : '#e9dcb8' });
    button(834, 834, 200, 54, 'Zug beenden', () => { if (!anim) endTurn(); }, { bg: G.moves === 0 ? '#f2c640' : '#e9dcb8' });
  }
  button(1048, 834, 136, 54, 'Menü', () => { save(); screen = 'menu'; sel = null; });
}

/* ---------- Zeichnen: Schlacht ---------- */
function drawUnit(u) {
  const k = Math.max(1, Math.ceil(5 * u.hp / u.max));
  const col = COL[u.side];
  const selected = B.sel[u.side].includes(u);
  ctx.save();
  ctx.translate(u.x, u.y);
  if (selected) {
    ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 24, 0, 6.3); ctx.stroke();
  } else if (u.auto) {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 22, 0, 6.3); ctx.stroke();
  }
  ctx.scale(1.3, 1.3);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ctx.ellipse(3, 4, 20, 14, 0, 0, 6.3); ctx.fill();
  ctx.rotate(u.face);
  if (u.type === 'i') {
    const pos = [[4, -10], [4, 0], [4, 10], [-6, -5], [-6, 5]];
    for (let n = 0; n < k; n++) {
      const [px, py] = pos[n];
      ctx.strokeStyle = '#2a2018'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(px, py + 2); ctx.lineTo(px + 11, py + 2); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px, py, 4.4, 0, 6.3); ctx.fill();
      ctx.strokeStyle = '#1b1510'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#efd0a6'; ctx.beginPath(); ctx.arc(px + 0.5, py, 2.3, 0, 6.3); ctx.fill();
    }
  } else if (u.type === 'c') {
    const pos = [[0, -12], [0, 0], [0, 12], [-14, -6], [-14, 6]];
    for (let n = 0; n < k; n++) {
      const [px, py] = pos[n];
      ctx.fillStyle = '#6b4a2b'; ctx.beginPath(); ctx.ellipse(px, py, 9.5, 3.8, 0, 0, 6.3); ctx.fill();
      ctx.beginPath(); ctx.ellipse(px + 10, py, 3.5, 2.4, 0, 0, 6.3); ctx.fill();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px - 1, py, 3.8, 0, 6.3); ctx.fill();
      ctx.strokeStyle = '#1b1510'; ctx.lineWidth = 1; ctx.stroke();
      ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(px, py - 3); ctx.lineTo(px + 8, py - 7); ctx.stroke();
    }
  } else {
    ctx.fillStyle = '#5a3d22'; ctx.fillRect(-9, -5, 11, 10);
    ctx.fillStyle = '#2b2b2b'; ctx.fillRect(-3, -3, 22, 6);
    ctx.fillStyle = '#3a2a18'; ctx.fillRect(-7, -9, 8, 3); ctx.fillRect(-7, 6, 8, 3);
    const crew = [[-16, -10], [-16, 10], [-22, 0], [-10, -15]];
    for (let n = 0; n < k - 1; n++) {
      const [px, py] = crew[n];
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px, py, 4, 0, 6.3); ctx.fill();
      ctx.fillStyle = '#efd0a6'; ctx.beginPath(); ctx.arc(px, py, 2.1, 0, 6.3); ctx.fill();
    }
  }
  ctx.restore();
  if (u.hp < u.max) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(u.x - 18, u.y - 34, 36, 5);
    ctx.fillStyle = u.hp / u.max > 0.5 ? '#7fd36a' : (u.hp / u.max > 0.25 ? '#f2c640' : '#e0533b');
    ctx.fillRect(u.x - 18, u.y - 34, 36 * u.hp / u.max, 5);
  }
}

function drawBattle() {
  ctx.drawImage(B.bg, 0, 0);
  // Marschziele
  for (const u of B.units) {
    if (u.hp <= 0) continue;
    if (u.order === 'move' && B.sel[u.side].includes(u)) {
      ctx.strokeStyle = 'rgba(255,226,122,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(u.x, u.y); ctx.lineTo(u.tx, u.ty); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  for (const u of B.units) if (u.hp > 0) drawUnit(u);
  // Granaten
  for (const s of B.shells) {
    const k = s.t / s.dur;
    const x = s.x + (s.tx - s.x) * k, y = s.y + (s.ty - s.y) * k - Math.sin(k * Math.PI) * 60;
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x, y, 4, 0, 6.3); ctx.fill();
  }
  // Effekte
  for (const f of B.fx) {
    const k = f.t / f.life;
    if (f.k === 'tracer') {
      ctx.strokeStyle = 'rgba(255,240,180,' + (1 - k) + ')'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2, f.y2); ctx.stroke();
    } else if (f.k === 'smoke') {
      ctx.fillStyle = 'rgba(235,235,230,' + (0.5 * (1 - k)) + ')';
      ctx.beginPath(); ctx.arc(f.x, f.y - k * 10, f.r * (1 + k * 2), 0, 6.3); ctx.fill();
    } else if (f.k === 'boom') {
      ctx.fillStyle = 'rgba(255,160,40,' + (1 - k) + ')';
      ctx.beginPath(); ctx.arc(f.x, f.y, 10 + k * 40, 0, 6.3); ctx.fill();
      ctx.fillStyle = 'rgba(255,240,180,' + (1 - k) + ')';
      ctx.beginPath(); ctx.arc(f.x, f.y, 6 + k * 15, 0, 6.3); ctx.fill();
    } else if (f.k === 'spark') {
      ctx.strokeStyle = 'rgba(255,255,200,' + (1 - k) + ')'; ctx.lineWidth = 2;
      for (let n = 0; n < 4; n++) {
        const a = n * 1.6 + f.x;
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x + Math.cos(a) * 10, f.y + Math.sin(a) * 10); ctx.stroke();
      }
    } else if (f.k === 'ping') {
      ctx.strokeStyle = f.c; ctx.globalAlpha = 1 - k; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(f.x, f.y, 8 + k * 22, 0, 6.3); ctx.stroke(); ctx.globalAlpha = 1;
    }
  }
  // Zieh-Pfeile
  for (const d of B.drags.values()) {
    if (!d.unit || Math.hypot(d.x - d.x0, d.y - d.y0) < 25) continue;
    const h = unitAt(d);
    const atk = h && h.side !== d.unit.side;
    ctx.strokeStyle = atk ? '#ff5a3c' : '#ffe27a'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(d.unit.x, d.unit.y); ctx.lineTo(d.x, d.y); ctx.stroke();
    const a = Math.atan2(d.y - d.unit.y, d.x - d.unit.x);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath(); ctx.moveTo(d.x, d.y);
    ctx.lineTo(d.x - Math.cos(a - 0.4) * 18, d.y - Math.sin(a - 0.4) * 18);
    ctx.lineTo(d.x - Math.cos(a + 0.4) * 18, d.y - Math.sin(a + 0.4) * 18); ctx.fill();
  }
  // Kopfzeile
  ctx.fillStyle = 'rgba(29,42,36,0.85)'; ctx.fillRect(0, 0, W, 64);
  const left = Math.max(0, BATTLE_LIMIT - B.t);
  const mm = Math.floor(left / 60), ss = String(Math.floor(left % 60)).padStart(2, '0');
  text('Schlacht um ' + B.name, W / 2, 22, 22, '#f3e9cf', 'center', '700', SERIF);
  text(mm + ':' + ss + '  ·  Verteidiger: ' + FACTION[B.def], W / 2, 47, 15, '#cfc6aa', 'center', '500');
  ctx.fillStyle = COL.B; ctx.beginPath(); ctx.arc(30, 32, 12, 0, 6.3); ctx.fill();
  text(FACTION.B + ': ' + alive('B').length + ' Einheiten', 50, 32, 18, '#f3e9cf', 'left', '600');
  ctx.fillStyle = COL.R; ctx.beginPath(); ctx.arc(W - 30, 32, 12, 0, 6.3); ctx.fill();
  text(FACTION.R + ': ' + alive('R').length + ' Einheiten', W - 50, 32, 18, '#f3e9cf', 'right', '600');
  // Fußzeile
  ctx.fillStyle = 'rgba(29,42,36,0.85)'; ctx.fillRect(0, 824, W, 76);
  if (!B.over) {
    if (controllable('B')) {
      button(14, 836, 170, 52, 'Alle wählen', () => selectAll('B'), { bg: COL_L.B, size: 19 });
      button(194, 836, 190, 52, 'Sturmangriff', () => chargeAll('B'), { bg: COL_L.B, size: 19 });
    }
    if (controllable('R')) {
      button(W - 384, 836, 190, 52, 'Sturmangriff', () => chargeAll('R'), { bg: COL_L.R, size: 19 });
      button(W - 184, 836, 170, 52, 'Alle wählen', () => selectAll('R'), { bg: COL_L.R, size: 19 });
    } else {
      wrap('Antippen = auswählen · Boden = marschieren · Gegner = angreifen · Ziehen geht auch', 760, 842, 420, 15, '#cfc6aa', 19);
    }
    button(W / 2 - 75, 836, 150, 52, B.paused ? 'Weiter' : 'Pause', () => { B.paused = !B.paused; }, { size: 19 });
  }
  if (B.paused) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 64, W, 760);
    text('Pause', W / 2, 440, 56, '#fff', 'center', '700', SERIF);
  }
}

/* ---------- Menü & Hilfe ---------- */
function drawMenu() {
  const keep = G;
  if (!G) { G = demoState(); }
  drawMapScene(false);
  G = keep;
  ctx.fillStyle = 'rgba(20,28,24,0.72)'; ctx.fillRect(0, 0, W, H);
  text('FRONTLINIE', W / 2, 200, 96, '#f2c640', 'center', '700', SERIF);
  text('Eisenbund gegen Kronland · Strategie und Schlacht', W / 2, 270, 24, '#f3e9cf', 'center', '500');
  const saved = loadSave();
  let y = 340;
  if (G && !G.winner) {
    button(W / 2 - 230, y, 460, 70, 'Zurück zum Spiel', () => { screen = 'map'; if (isCpuTurn()) setTimeout(aiStep, 600); }, { bg: '#f2c640', size: 26 }); y += 88;
  } else if (saved) {
    button(W / 2 - 230, y, 460, 70, 'Weiterspielen (Runde ' + saved.round + ')', () => {
      G = saved; screen = 'map'; sel = null; modal = null; if (isCpuTurn()) setTimeout(aiStep, 800);
    }, { bg: '#f2c640', size: 26 }); y += 88;
  }
  button(W / 2 - 230, y, 460, 70, '1 Spieler – gegen Computer', () => newGame('cpu'), { size: 26 }); y += 88;
  button(W / 2 - 230, y, 460, 70, '2 Spieler – an einem iPad', () => newGame('hot'), { size: 26 }); y += 88;
  button(W / 2 - 230, y, 460, 70, 'Anleitung', () => { screen = 'help'; }, { size: 26 });
  text('Tipp: In Safari „Teilen → Zum Home-Bildschirm“ – dann startet Frontlinie wie eine App.', W / 2, 860, 17, '#cfc6aa', 'center', '500');
}
let demo = null;
function demoState() {
  if (demo) return demo;
  demo = { regions: REGIONS.map((r, id) => ({ owner: id < 7 ? 'B' : (id > 9 ? 'R' : 'N'), army: { i: 0, c: 0, a: 0 }, tired: false })), cur: 'B' };
  return demo;
}

const HELP = [
  ['Ziel', 'Erobere die Hauptstadt des Gegners (★). Blau startet in Nordfeld, Rot in Südmoor.'],
  ['Strategiekarte', 'Pro Runde hast du 3 Züge. Tippe eine eigene Armee an, dann ein benachbartes Gebiet. Leere Gebiete eroberst du sofort, stehen dort feindliche Truppen, kommt es zur Schlacht. Jede Armee darf pro Runde einmal ziehen.'],
  ['Nachschub', 'Jeder Bahnhof (Lok-Symbol) liefert pro Runde 1 Infanterie. Die Hauptstadt stellt zusätzlich alle 2 Runden Kavallerie und alle 3 Runden Artillerie. Mit „Halbe Armee“ lässt du Truppen zur Verteidigung zurück.'],
  ['Schlacht', 'Einheit antippen = auswählen (mehrere möglich). Boden antippen = marschieren, Gegner antippen = angreifen. Du kannst eine Einheit auch direkt auf ihr Ziel ziehen. „Sturmangriff“ schickt alle Einheiten selbstständig nach vorn.'],
  ['Truppen', 'Infanterie: Allrounder, stark gegen Kavallerie, feuert nur im Stand. Kavallerie: schnell, Nahkampf, ideal gegen Artillerie. Artillerie: große Reichweite und Flächenschaden, aber langsam und im Nahbereich wehrlos.'],
  ['Zeitlimit', 'Steht nach 3 Minuten kein Sieger fest, hält der Verteidiger das Gebiet. Die überlebenden Angreifer ziehen sich zurück.'],
  ['2 Spieler', 'Ihr spielt abwechselnd am selben iPad. In der Schlacht steuert Blau links und Rot rechts – gleichzeitig. Angriffe gebt ihr per Ziehen auf den Gegner.']
];
function drawHelp() {
  ctx.fillStyle = '#1d2a24'; ctx.fillRect(0, 0, W, H);
  text('Anleitung', 60, 60, 44, '#f2c640', 'left', '700', SERIF);
  let y = 110;
  for (const [h, t] of HELP) {
    text(h, 60, y + 12, 21, '#f3e9cf', 'left', '700');
    y = wrap(t, 250, y, 880, 18, '#d8cfb5', 25) + 14;
  }
  button(W / 2 - 150, 820, 300, 60, 'Zurück', () => { screen = 'menu'; }, { size: 24 });
}

/* ---------- Modal & Banner ---------- */
function drawModal() {
  ui.length = 0;
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H);
  const w = 760;
  ctx.font = '500 20px ' + FONT;
  const h = 170 + modal.lines.length * 34 + 70;
  const x = (W - w) / 2, y = (H - h) / 2;
  rr(x, y, w, h, 18); ctx.fillStyle = '#efe3c2'; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = '#3a2e1d'; ctx.stroke();
  text(modal.title, W / 2, y + 50, 34, '#2b2316', 'center', '700', SERIF);
  let ly = y + 95;
  for (const l of modal.lines) ly = wrap(l, x + 40, ly, w - 80, 19, '#3a2e1d', 26) + 8;
  const n = modal.buttons.length, bw = n === 1 ? 300 : 320, gap = 24;
  const total = n * bw + (n - 1) * gap;
  modal.buttons.forEach((b, k) => {
    button(W / 2 - total / 2 + k * (bw + gap), y + h - 86, bw, 62, b.label, b.fn, { bg: k === 0 ? '#f2c640' : '#e9dcb8', size: 22 });
  });
}
function drawBanner(dt) {
  banner.t += dt;
  const life = 2.6;
  if (banner.t > life) { banner = null; return; }
  const a = Math.min(1, banner.t * 4, (life - banner.t) * 2);
  ctx.globalAlpha = a;
  const y = screen === 'battle' ? 120 : 100;
  ctx.font = '700 28px ' + SERIF;
  const w = Math.max(ctx.measureText(banner.text).width, banner.sub ? (ctx.font = '500 17px ' + FONT, ctx.measureText(banner.sub).width) : 0) + 60;
  rr(W / 2 - w / 2, y - 30, w, banner.sub ? 84 : 60, 14); ctx.fillStyle = 'rgba(29,42,36,0.9)'; ctx.fill();
  text(banner.text, W / 2, y, 28, '#f2c640', 'center', '700', SERIF);
  if (banner.sub) text(banner.sub, W / 2, y + 32, 17, '#f3e9cf', 'center', '500');
  ctx.globalAlpha = 1;
}

/* ---------- Hauptschleife ---------- */
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (anim) { anim.t += dt; if (anim.t >= anim.dur) resolveMove(); }
  if (screen === 'battle' && B) battleUpdate(dt);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#1d2a24'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, offX * dpr, offY * dpr);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
  ui = [];
  if (screen === 'menu') drawMenu();
  else if (screen === 'help') drawHelp();
  else if (screen === 'map' && G) drawMap();
  else if (screen === 'battle' && B) drawBattle();
  if (banner && !modal) drawBanner(dt);
  if (modal) drawModal();
  ctx.restore();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Test-Hooks (für automatisierte Tests)
window.__frontlinie = { get G() { return G; }, get B() { return B; }, get screen() { return screen; }, get modal() { return modal; } };

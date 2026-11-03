// Animated launcher backgrounds. Each one also sets the theme colors (black + yellow glass for the duck ones).
// DuckBG.mount(canvas, id) draws a scene into any canvas (the full-screen one, or the small previews in Settings).
(function () {
  const TAU = Math.PI * 2;
  const YELLOW = { accent: '#ffd84d', accent2: '#ffb52e', rgb: '255, 216, 77', light: '#fff1a8', dark: '#f2a900', on: '#1a1406' };
  const PURPLE = { accent: '#a78bfa', accent2: '#6bd0ff', rgb: '167, 139, 250', light: '#c4b1ff', dark: '#7e5cf0', on: '#120d24' };

  const rnd = (a, b) => a + Math.random() * (b - a);
  // a theme (accent + lighter / darker + text on it) from one color
  function TH(hex) {
    const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255];
    const mixc = (to, k) => '#' + c.map((v, i) => Math.round(v + (to[i] - v) * k).toString(16).padStart(2, '0')).join('');
    const lum = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
    return { accent: hex, accent2: mixc([0, 0, 0], 0.18), rgb: c.join(', '), light: mixc([255, 255, 255], 0.55), dark: mixc([0, 0, 0], 0.3), on: lum > 0.55 ? '#141414' : '#ffffff' };
  }

  // ---------------- your own color (exact) ----------------
  // Every color a scene draws goes through K(): with your own color picked, the scene's main color becomes exactly yours
  // and its other colors keep the same relation to it (a bit lighter, a bit more orange...). '' = the scene's own colors.
  let custom = '', curBase = '', want = null, baseHsl = null;
  const kcache = new Map();
  function rgbHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(h * 60 + 360) % 360, s, l];
  }
  function hslRgb(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  function K(str) {
    if (!custom || !want || !baseHsl) return str;
    const key = curBase + '|' + str;
    let out = kcache.get(key);
    if (out) return out;
    const hex = str[0] === '#';
    const c = hex ? [1, 3, 5].map((i) => parseInt(str.slice(i, i + 2), 16)) : str.split(',').map((v) => +v);
    const [h, s, l] = rgbHsl(c[0], c[1], c[2]);
    const nh = (want[0] + (h - baseHsl[0]) + 720) % 360;
    const ns = baseHsl[1] ? clamp01((want[1] * s) / baseHsl[1]) : want[1];
    // (very dark colors - the backgrounds themselves - only take your hue, so they stay dark)
    const nl = l < 0.2 ? l : clamp01(want[2] + (l - baseHsl[2]) * (l > baseHsl[2] ? (1 - want[2]) / Math.max(0.01, 1 - baseHsl[2]) : want[2] / Math.max(0.01, baseHsl[2])));
    const rgb = s < 0.08 ? c : hslRgb(nh, ns, nl);
    out = hex ? '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('') : rgb.join(', ');
    kcache.set(key, out);
    return out;
  }
  function useBase(accent) {
    if (accent === curBase) return;
    curBase = accent;
    const n = parseInt(accent.slice(1), 16);
    baseHsl = rgbHsl(n >> 16, (n >> 8) & 255, n & 255);
  }

  // ---------------- a little rubber duck ----------------
  function duck(g, x, y, s, rot, opts = {}) {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.scale(opts.flip ? -s : s, s);
    g.globalAlpha *= opts.alpha == null ? 1 : opts.alpha;
    // body
    const body = g.createLinearGradient(0, -30, 0, 22);
    body.addColorStop(0, K('#ffe36b'));
    body.addColorStop(1, K('#f2b200'));
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(-34, -4);
    g.quadraticCurveTo(-44, -22, -30, -20); // tail
    g.quadraticCurveTo(-18, -8, 0, -8);
    g.quadraticCurveTo(26, -10, 30, 4);
    g.quadraticCurveTo(30, 22, 0, 22);
    g.quadraticCurveTo(-30, 22, -34, -4);
    g.fill();
    // wing
    g.fillStyle = `rgba(${K('214, 150, 0')}, .55)`;
    g.beginPath();
    g.ellipse(-4, 4, 15, 9, -0.25, 0, TAU);
    g.fill();
    // head
    const head = g.createRadialGradient(14, -30, 2, 16, -24, 20);
    head.addColorStop(0, K('#fff09a'));
    head.addColorStop(1, K('#f5bf10'));
    g.fillStyle = head;
    g.beginPath();
    g.arc(16, -24, 16, 0, TAU);
    g.fill();
    // beak
    g.fillStyle = K('#ff8a1f');
    g.beginPath();
    g.moveTo(28, -26);
    g.quadraticCurveTo(46, -26, 44, -18);
    g.quadraticCurveTo(36, -14, 27, -18);
    g.closePath();
    g.fill();
    if (opts.shades) {
      // the Duckky logo duck: sunglasses
      g.fillStyle = K('#16161a');
      g.beginPath();
      g.ellipse(13.5, -27.5, 6.5, 5, 0, 0, TAU); // (both lenses the same size, level)
      g.ellipse(27, -27.5, 6.5, 5, 0, 0, TAU);
      g.fill();
      g.fillRect(6, -31, 28, 2.4);
      g.fillStyle = `rgba(${K('255, 255, 255')}, .45)`;
      g.fillRect(10, -30, 4, 1.5);
      g.fillRect(23.5, -30, 4, 1.5);
    } else {
      g.fillStyle = K('#1b1406');
      g.beginPath();
      g.arc(22, -28, 3, 0, TAU);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(23, -29, 1, 0, TAU);
      g.fill();
    }
    g.restore();
  }

  function glow(g, x, y, r, color, a) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${color}, ${a})`);
    gr.addColorStop(1, `rgba(${color}, 0)`);
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // the Sunbeams rays: { angle, width, strength, phase }
  const RAYS = [[2.02, 210, 0.16, 0.0], [2.20, 120, 0.12, 1.3], [2.38, 260, 0.15, 2.1], [2.55, 100, 0.10, 3.4], [2.72, 190, 0.12, 4.2], [2.90, 90, 0.08, 5.0]];
  /** One soft beam of light (white): bright near where it starts, fading along its length, soft at both sides. */
  function raySprite() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const x = c.getContext('2d'), im = x.createImageData(512, 128);
    for (let i = 0; i < 512; i++) {
      const u = i / 511, along = Math.pow(1 - u, 1.6) * Math.min(1, u * 12 + 0.25);
      for (let j = 0; j < 128; j++) {
        const v = (j - 63.5) / 63.5, k = (j * 512 + i) * 4;
        im.data[k] = im.data[k + 1] = im.data[k + 2] = 255;
        im.data[k + 3] = Math.round(255 * along * Math.exp(-v * v * 3.2));
      }
    }
    x.putImageData(im, 0, 0);
    return c;
  }
  /** The beam in a color (made again only when the color changes). */
  function tinted(st, rgb) {
    if (st.tintKey === rgb && st.tint) return st.tint;
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const x = c.getContext('2d');
    x.drawImage(st.ray, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = `rgb(${rgb})`;
    x.fillRect(0, 0, 512, 128);
    st.tint = c;
    st.tintKey = rgb;
    return c;
  }

  // ---------------- scenes ----------------
  const scenes = {
    solid: {
      // Solid color: one still color - your color from the picker (kept dark, so everything on it stays readable).
      // Nothing moves, so it's drawn once and then left alone - no work at all while it shows.
      name: 'Solid color',
      theme: YELLOW,
      still: true,
      create() { return {}; },
      draw(g, st, t, dt, w, h) {
        const c = hexRgb(custom || '#ffd84d') || [255, 216, 77];
        const [hh, ss] = rgbHsl(c[0], c[1], c[2]);
        g.fillStyle = `rgb(${hslRgb(hh, Math.min(0.6, ss), 0.1).join(',')})`;
        g.fillRect(0, 0, w, h);
      },
    },
    clean: {
      // Sunbeams: soft rays of warm light from the top right, slowly swaying and breathing, dust drifting through them
      name: 'Default',
      theme: YELLOW,
      create(w, h) {
        return { motes: Array.from({ length: 70 }, () => ({ x: rnd(w * 0.45, w), y: rnd(0, h * 0.8), r: rnd(0.6, 1.6), v: rnd(4, 12), p: rnd(0, TAU) })), ray: raySprite() };
      },
      draw(g, st, t, dt, w, h) {
        const top = g.createLinearGradient(0, 0, 0, h);
        top.addColorStop(0, K('#0d0a06'));
        top.addColorStop(1, K('#070605'));
        g.fillStyle = top;
        g.fillRect(0, 0, w, h);
        const m = Math.max(w, h), sx = w * 0.93, sy = -h * 0.06;
        const breathe = 0.85 + 0.15 * Math.sin(t * 0.35);
        glow(g, sx, sy, m * 0.62, K('255, 200, 90'), 0.34 * breathe);
        glow(g, sx, sy, m * 0.25, K('255, 227, 160'), 0.22 * breathe);
        // the rays: a soft white beam picture, turned, stretched and tinted (cheap - no blur each frame)
        const len = m * 1.1;
        g.save();
        g.globalCompositeOperation = 'lighter';
        for (const r of RAYS) {
          const ang = r[0] + 0.035 * Math.sin(t * 0.07 + r[3]);
          const a = r[2] * (0.6 + 0.4 * Math.sin(t * 0.22 + r[3] * 1.7));
          const wd = r[1] * (h / 1080) * (1 + 0.12 * Math.sin(t * 0.15 + r[3]));
          g.save();
          g.translate(sx, sy);
          g.rotate(ang);
          g.globalAlpha = Math.max(0, Math.min(1, a * 1.6));
          g.drawImage(tinted(st, K('255, 215, 140')), 0, -wd / 2, len, wd);
          g.restore();
        }
        g.restore();
        for (const d of st.motes) {
          d.x -= d.v * 0.35 * dt;
          d.y += d.v * 0.5 * dt;
          if (d.y > h + 4 || d.x < w * 0.35) { d.x = rnd(w * 0.45, w * 1.02); d.y = rnd(-10, h * 0.4); }
          const tw = 0.5 + 0.5 * Math.sin(t * 1.3 + d.p);
          const near = 1 - Math.min(1, Math.hypot(d.x - sx, d.y - sy) / (m * 0.9));
          g.fillStyle = `rgba(${K('255, 225, 160')}, ${(0.12 + 0.5 * near) * (0.35 + 0.65 * tw)})`;
          g.beginPath();
          g.arc(d.x, d.y, d.r * 1.3, 0, TAU);
          g.fill();
        }
      },
    },
    dots: {
      name: 'Dot Grid',
      theme: YELLOW,
      create() { return {}; },
      draw(g, st, t, dt, w, h) {
        g.fillStyle = K('#0a0a0b');
        g.fillRect(0, 0, w, h);
        const gap = 26;
        // a slow wave of light rolls across a quiet grid of dots
        for (let y = gap / 2; y < h; y += gap) {
          for (let x = gap / 2; x < w; x += gap) {
            const wv = Math.sin(x * 0.006 + y * 0.004 - t * 0.6) * 0.5 + 0.5;
            const a = 0.05 + 0.22 * Math.pow(wv, 3);
            g.fillStyle = `rgba(${K('255, 216, 77')}, ${a.toFixed(3)})`;
            g.fillRect(x - 1, y - 1, 2, 2);
          }
        }
        glow(g, w * 0.5, h * 1.1, Math.max(w, h) * 0.6, K('255, 190, 50'), 0.05);
      },
    },
    lines: {
      name: 'Flow Lines',
      theme: YELLOW,
      create() { return { n: 9 }; },
      draw(g, st, t, dt, w, h) {
        g.fillStyle = K('#0a0a0b');
        g.fillRect(0, 0, w, h);
        g.lineWidth = 1.2;
        // thin curves that slowly breathe
        for (let i = 0; i < st.n; i++) {
          const k = i / (st.n - 1);
          g.strokeStyle = `rgba(${K(`255, ${200 + Math.round(30 * k)}, ${60 + Math.round(60 * k)}`)}, ${(0.05 + 0.09 * Math.sin(k * Math.PI)).toFixed(3)})`;
          g.beginPath();
          for (let x = -20; x <= w + 20; x += 16) {
            const y = h * (0.25 + 0.55 * k) + Math.sin(x * 0.004 + t * 0.25 + i * 0.6) * h * 0.08 + Math.sin(x * 0.0015 - t * 0.12 + i) * h * 0.05;
            if (x === -20) g.moveTo(x, y); else g.lineTo(x, y);
          }
          g.stroke();
        }
      },
    },
    pond: {
      hidden: true, // (removed from the pickers - its colors are still used for your own pictures)
      name: 'Duck Pond',
      theme: YELLOW,
      create(w, h) {
        const k = Math.max(0.45, Math.min(1.3, h / 720));
        return {
          ducks: Array.from({ length: 5 }, (_, i) => ({ x: rnd(0, w), s: (i === 0 ? 1.15 : rnd(0.45, 0.85)) * k, v: rnd(8, 20) * k, p: rnd(0, TAU), shades: i === 0 })),
          bubbles: Array.from({ length: 40 }, () => ({ x: rnd(0, w), y: rnd(0, h), r: rnd(0.6, 2.2), v: rnd(6, 22), p: rnd(0, TAU) })),
          ripples: [],
          nextRipple: 0,
        };
      },
      draw(g, st, t, dt, w, h) {
        const bg = g.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, K('#060606'));
        bg.addColorStop(0.65, K('#0d0a04'));
        bg.addColorStop(1, K('#1a1305'));
        g.fillStyle = bg;
        g.fillRect(0, 0, w, h);
        g.globalCompositeOperation = 'lighter';
        glow(g, w * (0.25 + 0.08 * Math.sin(t * 0.07)), h * (0.3 + 0.06 * Math.cos(t * 0.05)), Math.max(w, h) * 0.45, K('255, 196, 40'), 0.13);
        glow(g, w * (0.8 + 0.06 * Math.cos(t * 0.06)), h * (0.18 + 0.05 * Math.sin(t * 0.08)), Math.max(w, h) * 0.35, K('255, 150, 20'), 0.09);
        glow(g, w * 0.55, h * 0.95, Math.max(w, h) * 0.5, K('255, 210, 60'), 0.08);
        // rising golden bubbles
        for (const b of st.bubbles) {
          b.y -= b.v * dt;
          if (b.y < -5) { b.y = h + 5; b.x = rnd(0, w); }
          const a = 0.25 + 0.25 * Math.sin(t * 1.4 + b.p);
          g.fillStyle = `rgba(${K('255, 220, 110')}, ${a})`;
          g.beginPath();
          g.arc(b.x + Math.sin(t * 0.8 + b.p) * 6, b.y, b.r, 0, TAU);
          g.fill();
        }
        g.globalCompositeOperation = 'source-over';
        // the water
        const wl = h * 0.76;
        const wave = (x, layer = 0) => wl + Math.sin(x * 0.012 + t * 0.9 + layer) * 5 + Math.sin(x * 0.027 - t * 1.3 + layer * 2) * 3;
        const water = g.createLinearGradient(0, wl - 10, 0, h);
        water.addColorStop(0, `rgba(${K('255, 200, 60')}, .10)`);
        water.addColorStop(1, `rgba(${K('0, 0, 0')}, .55)`);
        g.fillStyle = water;
        g.beginPath();
        g.moveTo(0, h);
        for (let x = 0; x <= w + 10; x += 10) g.lineTo(x, wave(x));
        g.lineTo(w, h);
        g.fill();
        for (let l = 0; l < 5; l++) {
          g.strokeStyle = `rgba(${K('255, 214, 90')}, ${0.22 - l * 0.04})`;
          g.lineWidth = 1.2;
          g.beginPath();
          for (let x = 0; x <= w + 10; x += 12) {
            const y = wave(x, l * 0.7) + l * (h - wl) * 0.18;
            x ? g.lineTo(x, y) : g.moveTo(x, y);
          }
          g.stroke();
        }
        // ripples
        if (t > st.nextRipple) {
          st.ripples.push({ x: rnd(0, w), y: rnd(wl + 15, h - 20), t: 0 });
          st.nextRipple = t + rnd(0.8, 2.2);
        }
        st.ripples = st.ripples.filter((r) => (r.t += dt) < 3);
        for (const r of st.ripples) {
          g.strokeStyle = `rgba(${K('255, 214, 90')}, ${0.25 * (1 - r.t / 3)})`;
          g.beginPath();
          g.ellipse(r.x, r.y, 8 + r.t * 30, 2 + r.t * 7, 0, 0, TAU);
          g.stroke();
        }
        // ducks (+ their reflections)
        for (const d of st.ducks.slice().sort((a, b) => a.s - b.s)) {
          d.x += d.v * dt;
          if (d.x > w + 80) d.x = -80;
          const y = wave(d.x) - 4 * d.s;
          const slope = (wave(d.x + 6) - wave(d.x - 6)) / 12;
          const bob = Math.sin(t * 1.6 + d.p) * 2 * d.s;
          g.save();
          g.globalAlpha = 0.18;
          g.translate(0, (y + bob) * 2 + 18 * d.s);
          g.scale(1, -1);
          duck(g, d.x, y + bob, d.s, slope, { shades: d.shades });
          g.restore();
          duck(g, d.x, y + bob, d.s, slope * 0.8, { shades: d.shades });
        }
      },
    },

    honey: {
      name: 'Honeycomb Glass',
      theme: YELLOW,
      create(w, h) {
        const r = Math.max(22, Math.min(46, w / 34));
        const cells = [];
        const hw = Math.sqrt(3) * r;
        for (let row = -1, y = 0; y < h + r * 2; row++, y = row * r * 1.5)
          for (let x = (row & 1 ? hw / 2 : 0) - hw; x < w + hw; x += hw) cells.push({ x, y, glow: 0, p: rnd(0, TAU) });
        return { r, cells, pulses: [], next: 0 };
      },
      draw(g, st, t, dt, w, h) {
        g.fillStyle = K('#070706');
        g.fillRect(0, 0, w, h);
        g.globalCompositeOperation = 'lighter';
        glow(g, w * 0.5 + Math.sin(t * 0.1) * w * 0.3, h * 0.5 + Math.cos(t * 0.13) * h * 0.25, Math.max(w, h) * 0.55, K('255, 190, 30'), 0.1);
        g.globalCompositeOperation = 'source-over';
        if (t > st.next) {
          st.pulses.push({ x: rnd(0, w), y: rnd(0, h), t: 0 });
          st.next = t + rnd(1.2, 2.6);
        }
        st.pulses = st.pulses.filter((p) => (p.t += dt) < 5);
        // a light sweep moving across
        const sweep = ((t * 0.12) % 1.6) - 0.3;
        const r = st.r;
        for (const c of st.cells) {
          let a = 0.05 + 0.03 * Math.sin(t * 0.7 + c.p);
          for (const p of st.pulses) {
            const d = Math.hypot(c.x - p.x, c.y - p.y);
            const ring = Math.abs(d - p.t * 220);
            if (ring < 60) a += (1 - ring / 60) * 0.35 * (1 - p.t / 5);
          }
          const sx = (c.x / w + c.y / h * 0.5) / 1.5;
          const sd = Math.abs(sx - sweep);
          if (sd < 0.08) a += (1 - sd / 0.08) * 0.14;
          g.beginPath();
          for (let i = 0; i < 6; i++) {
            const ang = TAU / 6 * i + Math.PI / 6;
            const px = c.x + Math.cos(ang) * (r - 3), py = c.y + Math.sin(ang) * (r - 3);
            i ? g.lineTo(px, py) : g.moveTo(px, py);
          }
          g.closePath();
          g.fillStyle = `rgba(${K('255, 200, 50')}, ${Math.min(0.45, a * 0.55)})`;
          g.fill();
          g.strokeStyle = `rgba(${K('255, 220, 110')}, ${Math.min(0.6, a + 0.05)})`;
          g.lineWidth = 1;
          g.stroke();
        }
        const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
        v.addColorStop(0, `rgba(${K('0, 0, 0')}, 0)`);
        v.addColorStop(1, `rgba(${K('0, 0, 0')}, .75)`);
        g.fillStyle = v;
        g.fillRect(0, 0, w, h);
      },
    },

    bokeh: {
      name: 'Golden Glass',
      theme: YELLOW,
      create(w, h) {
        const k = Math.min(1, Math.min(w, h) / 700);
        return { dots: Array.from({ length: 26 }, () => ({ x: rnd(0, w), y: rnd(0, h), r: rnd(25, 110) * k, vx: rnd(-8, 8), vy: rnd(-6, 6), p: rnd(0, TAU), hue: rnd(0, 1) })) };
      },
      draw(g, st, t, dt, w, h) {
        const bg = g.createLinearGradient(0, 0, w, h);
        bg.addColorStop(0, K('#0b0905'));
        bg.addColorStop(1, K('#030303'));
        g.fillStyle = bg;
        g.fillRect(0, 0, w, h);
        g.globalCompositeOperation = 'lighter';
        for (const d of st.dots) {
          d.x += d.vx * dt;
          d.y += d.vy * dt;
          if (d.x < -d.r) d.x = w + d.r; if (d.x > w + d.r) d.x = -d.r;
          if (d.y < -d.r) d.y = h + d.r; if (d.y > h + d.r) d.y = -d.r;
          const a = 0.05 + 0.05 * Math.sin(t * 0.5 + d.p);
          const col = d.hue < 0.6 ? K('255, 205, 60') : d.hue < 0.85 ? K('255, 150, 30') : K('255, 240, 180');
          g.fillStyle = `rgba(${col}, ${a})`;
          g.beginPath();
          g.arc(d.x, d.y, d.r, 0, TAU);
          g.fill();
          g.strokeStyle = `rgba(${col}, ${a * 1.6})`;
          g.lineWidth = 1.5;
          g.stroke();
        }
        g.globalCompositeOperation = 'source-over';
        // glass streaks
        g.save();
        g.rotate(-0.35);
        for (let i = 0; i < 3; i++) {
          const x = ((t * 30 + i * 520) % (w + 900)) - 400;
          const gr = g.createLinearGradient(x, 0, x + 140, 0);
          gr.addColorStop(0, `rgba(${K('255, 255, 255')}, 0)`);
          gr.addColorStop(0.5, `rgba(${K('255, 240, 200')}, .035)`);
          gr.addColorStop(1, `rgba(${K('255, 255, 255')}, 0)`);
          g.fillStyle = gr;
          g.fillRect(x, -h, 140, h * 3);
        }
        g.restore();
      },
    },

    aurora: {
      hidden: true, // (removed from the pickers)
      name: 'Purple Aurora',
      theme: PURPLE,
      create(w, h) {
        return { stars: Array.from({ length: 60 }, () => ({ x: Math.random(), y: Math.random(), r: rnd(0.3, 1.9), s: rnd(0.00005, 0.0003), p: rnd(0, 6) })) };
      },
      draw(g, st, t, dt, w, h) {
        g.fillStyle = K('#0b0c10');
        g.fillRect(0, 0, w, h);
        g.globalCompositeOperation = 'lighter';
        const m = Math.max(w, h);
        glow(g, w * (0.2 + 0.05 * Math.sin(t * 0.09)), h * 0.3, m * 0.45, K('109, 75, 216'), 0.35);
        glow(g, w * (0.8 + 0.05 * Math.cos(t * 0.07)), h * 0.2, m * 0.38, K('43, 143, 208'), 0.3);
        glow(g, w * 0.6, h * (0.85 + 0.04 * Math.sin(t * 0.08)), m * 0.42, K('176, 69, 156'), 0.3);
        for (const d of st.stars) {
          d.y -= d.s * 60 * dt;
          if (d.y < -0.02) { d.y = 1.02; d.x = Math.random(); }
          g.fillStyle = `rgba(${K('200, 185, 255')}, ${Math.max(0, 0.25 + 0.35 * Math.sin(t * 1.1 + d.p))})`;
          g.beginPath();
          g.arc(d.x * w, d.y * h, d.r, 0, TAU);
          g.fill();
        }
        g.globalCompositeOperation = 'source-over';
      },
    },

    // ---------------- more backgrounds (each its own look and color) ----------------
    space: {
      name: 'Deep Space',
      theme: TH('#8ea2ff'),
      create() { return { stars: Array.from({ length: 220 }, () => ({ x: rnd(-1, 1), y: rnd(-1, 1), z: rnd(0.05, 1) })) }; },
      draw(g, st, t, dt, w, h) {
        g.fillStyle = K('#04050a');
        g.fillRect(0, 0, w, h);
        const m = Math.max(w, h);
        g.globalCompositeOperation = 'lighter';
        glow(g, w * 0.3, h * 0.35, m * 0.4, K('90, 110, 255'), 0.08);
        glow(g, w * 0.75, h * 0.7, m * 0.35, K('150, 90, 255'), 0.06);
        // stars coming slowly towards you
        const cx = w / 2, cy = h / 2;
        for (const s of st.stars) {
          s.z -= Math.min(dt, 0.1) * 0.2;
          if (s.z < 0.03) { s.z = 1; s.x = rnd(-1, 1); s.y = rnd(-1, 1); }
          const px = cx + (s.x / s.z) * w * 0.35, py = cy + (s.y / s.z) * h * 0.35;
          if (px < -10 || px > w + 10 || py < -10 || py > h + 10) { s.z = 1; continue; }
          const near = 1 - s.z;
          g.fillStyle = `rgba(${K('210, 220, 255')}, ${(0.15 + near * 0.75).toFixed(3)})`;
          g.beginPath();
          g.arc(px, py, 0.4 + near * 1.6, 0, TAU);
          g.fill();
        }
        g.globalCompositeOperation = 'source-over';
      },
    },

    topo: {
      name: 'Topographic',
      theme: TH('#a3e635'),
      create() { return {}; },
      draw(g, st, t, dt, w, h) {
        g.fillStyle = K('#070906');
        g.fillRect(0, 0, w, h);
        // contour lines of slowly shifting hills
        const S = 16, cols = Math.ceil(w / S) + 1, rows = Math.ceil(h / S) + 1;
        const tt = t * 0.06;
        const f = (x, y) => Math.sin(x * 0.0042 + tt) + Math.sin(y * 0.0051 - tt * 0.8) + Math.sin((x + y) * 0.0027 + tt * 0.6) + Math.sin(Math.hypot(x - w * 0.6, y - h * 0.4) * 0.0055 - tt);
        const v = new Float32Array(cols * rows);
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) v[j * cols + i] = f(i * S, j * S);
        g.lineWidth = 1;
        for (let L = 0; L < 18; L++) {
          const lvl = -3.4 + L * 0.4;
          g.strokeStyle = `rgba(${K('163, 230, 53')}, ${L % 4 === 0 ? 0.32 : 0.13})`;
          g.beginPath();
          for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
            const a = v[j * cols + i], b = v[j * cols + i + 1], c = v[(j + 1) * cols + i + 1], d = v[(j + 1) * cols + i];
            const k = (a > lvl) | ((b > lvl) << 1) | ((c > lvl) << 2) | ((d > lvl) << 3);
            if (k === 0 || k === 15) continue;
            const x = i * S, y = j * S;
            const lerp = (p, q) => (lvl - p) / (q - p);
            const e = [[x + S * lerp(a, b), y], [x + S, y + S * lerp(b, c)], [x + S * lerp(d, c), y + S], [x, y + S * lerp(a, d)]];
            const segs = { 1: [3, 0], 2: [0, 1], 3: [3, 1], 4: [1, 2], 5: [3, 2, 0, 1], 6: [0, 2], 7: [3, 2], 8: [2, 3], 9: [0, 2], 10: [0, 3, 1, 2], 11: [1, 2], 12: [1, 3], 13: [0, 1], 14: [0, 3] }[k];
            for (let s = 0; s < segs.length; s += 2) { g.moveTo(e[segs[s]][0], e[segs[s]][1]); g.lineTo(e[segs[s + 1]][0], e[segs[s + 1]][1]); }
          }
          g.stroke();
        }
      },
    },

    cubes: {
      name: 'Floating Cubes',
      theme: TH('#34d399'),
      create(w, h) {
        const k = Math.min(1.2, Math.max(0.5, h / 720));
        return { cubes: Array.from({ length: 22 }, () => ({ x: rnd(0, w), y: rnd(0, h), s: rnd(8, 34) * k, v: rnd(4, 14), p: rnd(0, TAU), line: Math.random() < 0.35 })) };
      },
      draw(g, st, t, dt, w, h) {
        const bg = g.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, K('#06100c'));
        bg.addColorStop(1, K('#030605'));
        g.fillStyle = bg;
        g.fillRect(0, 0, w, h);
        // little blocks drifting up (seen from a corner)
        for (const c of st.cubes.slice().sort((a, b) => a.s - b.s)) {
          c.y -= c.v * dt;
          if (c.y < -c.s * 2) { c.y = h + c.s * 2; c.x = rnd(0, w); }
          const x = c.x + Math.sin(t * 0.3 + c.p) * 10, y = c.y, s = c.s;
          const depth = 0.25 + (s / 40) * 0.5;
          const top = [[x, y - s], [x + s * 0.87, y - s * 0.5], [x, y], [x - s * 0.87, y - s * 0.5]];
          const left = [[x - s * 0.87, y - s * 0.5], [x, y], [x, y + s], [x - s * 0.87, y + s * 0.5]];
          const right = [[x + s * 0.87, y - s * 0.5], [x, y], [x, y + s], [x + s * 0.87, y + s * 0.5]];
          const face = (pts, col, a) => {
            g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.closePath();
            if (c.line) { g.strokeStyle = `rgba(${K('52, 211, 153')}, ${(a * 0.9).toFixed(3)})`; g.lineWidth = 1; g.stroke(); }
            else { g.fillStyle = `rgba(${col}, ${a.toFixed(3)})`; g.fill(); }
          };
          face(top, K('110, 240, 190'), depth * 0.55);
          face(left, K('40, 170, 120'), depth * 0.45);
          face(right, K('25, 120, 90'), depth * 0.45);
        }
      },
    },

    ocean: {
      hidden: true, // (removed from the pickers)
      name: 'Ocean Waves',
      theme: TH('#38bdf8'),
      create() { return {}; },
      draw(g, st, t, dt, w, h) {
        const sky = g.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, K('#030812'));
        sky.addColorStop(0.55, K('#06142a'));
        sky.addColorStop(1, K('#020611'));
        g.fillStyle = sky;
        g.fillRect(0, 0, w, h);
        glow(g, w * 0.5, h * 0.42, Math.max(w, h) * 0.45, K('56, 189, 248'), 0.07);
        // layers of waves, the far ones slow and faint, the near ones darker
        for (let L = 0; L < 5; L++) {
          const base = h * (0.52 + L * 0.1);
          const amp = 10 + L * 8, sp = 0.18 + L * 0.09, len = 0.006 - L * 0.0006;
          g.fillStyle = K(['#0b2a4a', '#0a2240', '#081a33', '#061326', '#040c1a'][L]);
          g.beginPath();
          g.moveTo(0, h);
          for (let x = 0; x <= w + 12; x += 12) g.lineTo(x, base + Math.sin(x * len + t * sp + L * 1.7) * amp + Math.sin(x * len * 2.3 - t * sp * 1.3 + L) * amp * 0.35);
          g.lineTo(w, h);
          g.closePath();
          g.fill();
          g.strokeStyle = `rgba(${K('125, 211, 252')}, ${(0.32 - L * 0.05).toFixed(3)})`;
          g.lineWidth = 1;
          g.beginPath();
          for (let x = 0; x <= w + 12; x += 12) { const y = base + Math.sin(x * len + t * sp + L * 1.7) * amp + Math.sin(x * len * 2.3 - t * sp * 1.3 + L) * amp * 0.35; x ? g.lineTo(x, y) : g.moveTo(x, y); }
          g.stroke();
        }
      },
    },

    synth: {
      name: 'Retro Horizon',
      theme: TH('#ff4fa3'),
      create() { return { stars: Array.from({ length: 50 }, () => ({ x: Math.random(), y: Math.random() * 0.55, r: rnd(0.4, 1.3), p: rnd(0, TAU) })) }; },
      draw(g, st, t, dt, w, h) {
        const hz = h * 0.62;
        const sky = g.createLinearGradient(0, 0, 0, hz);
        sky.addColorStop(0, K('#08040f'));
        sky.addColorStop(1, K('#2a0a2e'));
        g.fillStyle = sky;
        g.fillRect(0, 0, w, hz);
        for (const s of st.stars) { g.fillStyle = `rgba(${K('255, 200, 240')}, ${(0.2 + 0.3 * Math.sin(t + s.p)).toFixed(3)})`; g.fillRect(s.x * w, s.y * h, s.r, s.r); }
        // the sun, with stripes cut out of it
        const r = Math.min(w, h) * 0.2, sx = w / 2, sy = hz - r * 0.55;
        const sun = g.createLinearGradient(0, sy - r, 0, sy + r);
        sun.addColorStop(0, K('#ffd36b'));
        sun.addColorStop(1, K('#ff3d8b'));
        g.save();
        g.beginPath(); g.arc(sx, sy, r, 0, TAU); g.clip();
        g.fillStyle = sun;
        g.fillRect(sx - r, sy - r, r * 2, r * 2);
        g.fillStyle = K('#1a0720');
        for (let i = 0; i < 6; i++) { const yy = sy + r * (0.12 + i * 0.15); g.fillRect(sx - r, yy, r * 2, 2 + i * 1.6); }
        g.restore();
        glow(g, sx, sy, r * 2.4, K('255, 79, 163'), 0.12);
        // the floor: a grid rushing towards you
        const floor = g.createLinearGradient(0, hz, 0, h);
        floor.addColorStop(0, K('#1a0620'));
        floor.addColorStop(1, K('#050208'));
        g.fillStyle = floor;
        g.fillRect(0, hz, w, h - hz);
        g.strokeStyle = `rgba(${K('255, 79, 163')}, .45)`;
        g.lineWidth = 1;
        g.beginPath();
        for (let i = -14; i <= 14; i++) { g.moveTo(w / 2 + i * 12, hz); g.lineTo(w / 2 + i * w * 0.16, h); }
        const off = (t * 0.35) % 1;
        for (let k = 0; k < 14; k++) { const z = (k + off) / 14; const y = hz + (h - hz) * z * z; g.moveTo(0, y); g.lineTo(w, y); }
        g.stroke();
        g.strokeStyle = `rgba(${K('255, 150, 200')}, .5)`;
        g.beginPath(); g.moveTo(0, hz); g.lineTo(w, hz); g.stroke();
      },
    },

    underwater: {
      // deep teal water: soft light rays from the surface swaying, bubbles wobbling up, little specks drifting
      name: 'Underwater',
      theme: TH('#3dd6e8'),
      create(w, h) {
        return {
          ray: raySprite(),
          rays: Array.from({ length: 8 }, (_, i) => ({ x: 0.3 + i * 0.09 + rnd(-0.02, 0.02), wd: rnd(40, 110), a: rnd(0.08, 0.16), p: rnd(0, TAU) })),
          bubbles: Array.from({ length: 34 }, () => ({ x: rnd(w * 0.3, w), y: rnd(0, h), r: rnd(1.5, 6), v: rnd(14, 40), p: rnd(0, TAU) })),
          specks: Array.from({ length: 70 }, () => ({ x: rnd(0, w), y: rnd(0, h), r: rnd(0.5, 1.4), v: rnd(2, 7), p: rnd(0, TAU) })),
        };
      },
      draw(g, st, t, dt, w, h) {
        const gr = g.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, K('#0b3a4a'));
        gr.addColorStop(0.5, K('#06202b'));
        gr.addColorStop(1, K('#030c12'));
        g.fillStyle = gr;
        g.fillRect(0, 0, w, h);
        // the surface glow
        glow(g, w * 0.62, -h * 0.1, Math.max(w, h) * 0.5, K('140, 240, 255'), 0.16);
        // light rays coming down from the surface, swaying slowly
        g.save();
        g.globalCompositeOperation = 'lighter';
        const tint = tinted(st, K('140, 240, 255'));
        for (const r of st.rays) {
          const x = w * r.x + Math.sin(t * 0.15 + r.p) * w * 0.02;
          g.save();
          g.translate(x, -h * 0.05);
          g.rotate(Math.PI / 2 + 0.18 + Math.sin(t * 0.1 + r.p) * 0.05);
          g.globalAlpha = r.a * (0.7 + 0.3 * Math.sin(t * 0.4 + r.p * 2));
          g.drawImage(tint, 0, -r.wd / 2 * (h / 1080), h * 1.05, r.wd * (h / 1080));
          g.restore();
        }
        g.restore();
        // specks drifting
        for (const p of st.specks) {
          p.y += p.v * dt * 0.4; p.x += Math.sin(t * 0.5 + p.p) * 0.15;
          if (p.y > h + 4) { p.y = -4; p.x = rnd(0, w); }
          g.fillStyle = `rgba(${K('200, 245, 255')}, ${0.15 + 0.15 * Math.sin(t + p.p)})`;
          g.fillRect(p.x, p.y, p.r * 2, p.r * 2);
        }
        // bubbles: a thin ring with a little shine, wobbling as they rise
        for (const b of st.bubbles) {
          b.y -= b.v * dt;
          const x = b.x + Math.sin(t * 1.6 + b.p) * 4;
          if (b.y < -10) { b.y = h + 10; b.x = rnd(w * 0.3, w); }
          g.strokeStyle = `rgba(${K('200, 250, 255')}, 0.45)`;
          g.lineWidth = 1.2;
          g.beginPath(); g.arc(x, b.y, b.r, 0, TAU); g.stroke();
          g.fillStyle = 'rgba(255,255,255,.4)';
          g.beginPath(); g.arc(x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.25, 0, TAU); g.fill();
        }
      },
    },
    network: {
      name: 'Constellation',
      theme: TH('#22d3ee'),
      create(w, h) {
        const n = Math.round(Math.min(70, Math.max(24, (w * h) / 16000)));
        return { pts: Array.from({ length: Math.round(n * 1.3) }, () => ({ x: rnd(0, w), y: rnd(0, h), vx: rnd(-10, 10), vy: rnd(-10, 10) })) };
      },
      draw(g, st, t, dt, w, h) {
        g.fillStyle = K('#040a0d');
        g.fillRect(0, 0, w, h);
        const pts = st.pts, R = Math.min(200, Math.max(130, w / 7));
        for (const p of pts) {
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.x < 0 || p.x > w) p.vx *= -1;
          if (p.y < 0 || p.y > h) p.vy *= -1;
        }
        // thin lines between stars that are close together
        g.lineWidth = 1;
        for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
          const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
          if (d > R) continue;
          g.strokeStyle = `rgba(${K('34, 211, 238')}, ${((1 - d / R) * 0.4).toFixed(3)})`;
          g.beginPath(); g.moveTo(pts[i].x, pts[i].y); g.lineTo(pts[j].x, pts[j].y); g.stroke();
        }
        for (const p of pts) { g.fillStyle = `rgba(${K('165, 243, 252')}, .7)`; g.beginPath(); g.arc(p.x, p.y, 1.6, 0, TAU); g.fill(); }
      },
    },

    embers: {
      name: 'Embers',
      theme: TH('#ff6b4a'),
      create(w, h) { return { e: Array.from({ length: 90 }, () => ({ x: rnd(0, w), y: rnd(0, h), v: rnd(14, 46), r: rnd(1, 2.8), p: rnd(0, TAU), life: rnd(0, 1) })) }; },
      draw(g, st, t, dt, w, h) {
        const bg = g.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, K('#070302'));
        bg.addColorStop(1, K('#160604'));
        g.fillStyle = bg;
        g.fillRect(0, 0, w, h);
        g.globalCompositeOperation = 'lighter';
        glow(g, w * (0.5 + 0.15 * Math.sin(t * 0.1)), h * 1.08, Math.max(w, h) * 0.6, K('255, 90, 40'), 0.16);
        // sparks rising, flickering and fading as they go
        for (const e of st.e) {
          e.y -= e.v * dt;
          e.x += Math.sin(t * 0.8 + e.p) * 12 * dt;
          if (e.y < -10) { e.y = h + 10; e.x = rnd(0, w); }
          const up = 1 - e.y / h;
          const a = Math.max(0, (0.75 - up * 0.65) * (0.6 + 0.4 * Math.sin(t * 6 + e.p)));
          g.fillStyle = `rgba(${K(up > 0.5 ? '255, 140, 60' : '255, 190, 90')}, ${a.toFixed(3)})`;
          g.beginPath();
          g.arc(e.x, e.y, e.r, 0, TAU);
          g.fill();
        }
        g.globalCompositeOperation = 'source-over';
      },
    },

    peaks: {
      hidden: true, // (removed from the pickers)
      name: 'Night Mountains',
      theme: TH('#cbd5e1'),
      create(w, h) {
        // mountain ranges from smooth, looping noise: far ones big with sharp peaks, near ones lower and rounder
        const N = 256;
        // a mountain range that loops: a few big peaks, then each gap split again and again with a smaller random
        // bump (midpoint displacement) - craggy, natural ridges
        const range = (peaks, rough, valley) => {
          let pts = Array.from({ length: peaks }, (_, i) => (i % 2 ? rnd(0, valley) : rnd(0.55, 1)));
          let d = 0.45;
          while (pts.length < N) {
            const out = [];
            for (let i = 0; i < pts.length; i++) {
              const a2 = pts[i], b2 = pts[(i + 1) % pts.length];
              out.push(a2, Math.max(0, Math.min(1.1, (a2 + b2) / 2 + rnd(-d, d))));
            }
            pts = out;
            d *= rough;
          }
          return pts;
        };
        const layers = [
          { pts: range(8, 0.55, 0.35), base: 0.66, amp: 0.34, sp: 1.2, top: '#2c3554', bot: '#1a2034', rim: 0.26, snow: true },
          { pts: range(10, 0.52, 0.4), base: 0.76, amp: 0.3, sp: 2.5, top: '#232b47', bot: '#141a2c', rim: 0.2 },
          { pts: range(12, 0.48, 0.5), base: 0.85, amp: 0.2, sp: 5, top: '#151b2f', bot: '#0d1220', rim: 0.13 },
          { pts: range(14, 0.45, 0.55), base: 0.95, amp: 0.13, sp: 9, top: '#0b0f1b', bot: '#06090f', rim: 0.08 },
        ];
        return { layers, shoot: null, nextShoot: rnd(4, 9),
          stars: Array.from({ length: 160 }, () => ({ x: Math.random(), y: Math.pow(Math.random(), 1.6) * 0.62, r: Math.random() < 0.08 ? rnd(1.1, 1.7) : rnd(0.3, 0.9), p: rnd(0, TAU), sp: rnd(0.4, 1.4) })) };
      },
      draw(g, st, t, dt, w, h) {
        // the sky: deep at the top, a soft blue glow along the horizon
        const sky = g.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, K('#04060c'));
        sky.addColorStop(0.45, K('#0b1122'));
        sky.addColorStop(0.72, K('#1a2440'));
        sky.addColorStop(1, K('#0a0e18'));
        g.fillStyle = sky;
        g.fillRect(0, 0, w, h);
        // stars (they twinkle; a few bright ones have a little glow)
        for (const s of st.stars) {
          const a = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t * s.sp + s.p));
          if (s.r > 1) glow(g, s.x * w, s.y * h, s.r * 6, K('200, 215, 255'), a * 0.25);
          g.fillStyle = `rgba(${K('230, 236, 255')}, ${a.toFixed(3)})`;
          g.beginPath(); g.arc(s.x * w, s.y * h, s.r, 0, TAU); g.fill();
        }
        // now and then a shooting star
        st.nextShoot -= dt;
        if (!st.shoot && st.nextShoot <= 0) { st.shoot = { x: rnd(0.15, 0.85) * w, y: rnd(0.05, 0.3) * h, a: rnd(0.35, 0.6), t: 0, len: rnd(120, 220) }; st.nextShoot = rnd(7, 15); }
        if (st.shoot) {
          const sh = st.shoot; sh.t += dt;
          const life = 0.9, k = sh.t / life;
          if (k >= 1) st.shoot = null;
          else {
            const dx = Math.cos(sh.a), dy = Math.sin(sh.a), hx = sh.x + dx * k * 420, hy = sh.y + dy * k * 420;
            const tail = g.createLinearGradient(hx, hy, hx - dx * sh.len, hy - dy * sh.len);
            const fade = Math.sin(k * Math.PI);
            tail.addColorStop(0, `rgba(${K('235, 240, 255')}, ${(0.9 * fade).toFixed(3)})`);
            tail.addColorStop(1, `rgba(${K('235, 240, 255')}, 0)`);
            g.strokeStyle = tail; g.lineWidth = 1.6; g.lineCap = 'round';
            g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx - dx * sh.len, hy - dy * sh.len); g.stroke();
          }
        }
        // the moon: soft halo, a calm face with a few darker patches
        const mx = w * 0.76, my = h * 0.2, mr = Math.min(w, h) * 0.055;
        glow(g, mx, my, mr * 9, K('180, 200, 255'), 0.07);
        glow(g, mx, my, mr * 3.2, K('210, 222, 255'), 0.12);
        const mg = g.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
        mg.addColorStop(0, K('#f6f8ff')); mg.addColorStop(1, K('#cfd8ea'));
        g.fillStyle = mg; g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill();
        g.fillStyle = `rgba(${K('150, 165, 195')}, 0.13)`;
        for (const [ox, oy, rr] of [[-0.3, -0.15, 0.22], [0.25, 0.2, 0.16], [0.05, -0.38, 0.1], [-0.1, 0.35, 0.12]]) { g.beginPath(); g.arc(mx + ox * mr, my + oy * mr, rr * mr, 0, TAU); g.fill(); }
        // the ranges, far to near - each with moonlight on its edge and mist settling behind the next one
        st.layers.forEach((L, i) => {
          const n = L.pts.length, step = w / 120, shift = (t * L.sp) / step;
          const ys = [];
          for (let x = 0, k = 0; x <= w + step; x += step, k++) {
            const idx = (k + shift) % n, a = Math.floor(idx), f = idx - a;
            const v = L.pts[a] * (1 - f) + L.pts[(a + 1) % n] * f;
            ys.push([x, h * (L.base - L.amp * v)]);
          }
          const minY = Math.min(...ys.map((p) => p[1]));
          const fill = g.createLinearGradient(0, minY, 0, h);
          fill.addColorStop(0, K(L.top)); fill.addColorStop(1, K(L.bot));
          g.fillStyle = fill;
          g.beginPath(); g.moveTo(0, h);
          for (const [x, y] of ys) g.lineTo(x, y);
          g.lineTo(w, h); g.closePath(); g.fill();
          // snow on the tallest peaks (only what rises above the snow line)
          if (L.snow) {
            g.save(); g.clip();
            const sl = g.createLinearGradient(0, minY, 0, minY + h * 0.09);
            sl.addColorStop(0, `rgba(${K('215, 225, 250')}, 0.32)`);
            sl.addColorStop(1, `rgba(${K('215, 225, 250')}, 0)`);
            g.fillStyle = sl; g.fillRect(0, minY, w, h * 0.09);
            g.restore();
          }
          // moonlight catching the ridge
          g.strokeStyle = `rgba(${K('190, 205, 240')}, ${L.rim})`; g.lineWidth = 1.2;
          g.beginPath(); ys.forEach(([x, y], j) => (j ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
        });
      },
    },
  };

  // ---------------- running them ----------------
  const mounts = new Set();
  let last = 0;

  // 'normal' = smooth; 'low' = 30 fps (launcher in the background); 'paused' = still (Minecraft is running - the GPU is the game's)
  let mode = 'normal', lastDraw = 0;
  function frame(now) {
    // (paused: nothing moves, but anything not drawn yet - a preview just opened, a resized window - still gets one still frame)
    const paused = mode === 'paused';
    if ((paused && now - lastDraw < 250) || (mode === 'low' && now - lastDraw < 33)) { requestAnimationFrame(frame); return; }
    if (paused) { let todo = false; for (const m of mounts) if (!m.still || m.cw !== m.canvas.clientWidth || m.ch !== m.canvas.clientHeight) { todo = true; break; } if (!todo) { last = now; lastDraw = now; requestAnimationFrame(frame); return; } }
    lastDraw = now;
    const dt = Math.min(0.1, (now - (last || now)) / 1000);
    last = now;
    if (!document.hidden) {
      for (const m of mounts) {
        if (!m.canvas.isConnected) { mounts.delete(m); continue; }
        if (m.onlyVisible && !m.canvas.offsetParent) continue; // previews: only while on screen
        const dpr = m.lowRes ? 1 : Math.min(2, window.devicePixelRatio || 1);
        const w = m.canvas.clientWidth, h = m.canvas.clientHeight;
        if (!w || !h) continue;
        if (paused && m.still && m.cw === w && m.ch === h) continue;
        // (re-made when the size changes - also when only the zoom changed and the pixel count happens to stay the same)
        if (m.canvas.width !== Math.round(w * dpr) || m.canvas.height !== Math.round(h * dpr) || !m.state || m.cw !== w || m.ch !== h) {
          m.cw = w; m.ch = h;
          m.canvas.width = Math.round(w * dpr);
          m.canvas.height = Math.round(h * dpr);
          m.state = m.scene.create(w, h);
          m.fresh = true;
          if (m.scene.clear) { m.g.fillStyle = m.scene.clear; m.g.fillRect(0, 0, m.canvas.width, m.canvas.height); }
        }
        // (a still scene - Solid color: drawn again only when its size or color changes)
        const stillKey = m.scene.still ? (custom || '') + '|' + w + 'x' + h : '';
        if (m.scene.still && !m.fresh && m.drawnKey === stillKey) continue;
        m.g.setTransform(dpr, 0, 0, dpr, 0, 0);
        useBase(m.scene.theme.accent);
        m.t += dt * (m.speed || 1);
        try {
          // (a still frame of a scene that builds up over time - trails, fading in: run it for a moment first)
          if (paused && m.fresh) for (let i = 0; i < 45; i++) { m.t += 1 / 30; m.scene.draw(m.g, m.state, m.t, 1 / 30, w, h); }
          else m.scene.draw(m.g, m.state, m.t, paused ? 0 : dt * (m.speed || 1), w, h);
          m.fresh = false; m.err = 0; m.still = paused; m.drawnKey = stillKey;
        } catch (e) {
          // (one bad frame doesn't blank it for good - it's made again and tried next frame; only one that keeps failing stops)
          console.error(e);
          m.state = null;
          if ((m.err = (m.err || 0) + 1) > 20) mounts.delete(m);
        }
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function mount(canvas, id, opts = {}) {
    for (const m of mounts) if (m.canvas === canvas) mounts.delete(m);
    const scene = scenes[id] || scenes.clean;
    const m = { canvas, scene, g: canvas.getContext('2d'), t: Math.random() * 20, state: null, ...opts };
    mounts.add(m);
    return m;
  }

  // ---------------- your own color ----------------
  const hexRgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const toHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  function hsl([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(h * 60 + 360) % 360, s, l];
  }
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  /** A full theme (accent, lighter, darker, text on it) made from one color. */
  function themeFrom(hex) {
    const c = hexRgb(hex);
    if (!c) return null;
    const lum = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
    return { accent: toHex(c), accent2: toHex(mix(c, [0, 0, 0], 0.18)), rgb: c.join(', '), light: toHex(mix(c, [255, 255, 255], 0.55)), dark: toHex(mix(c, [0, 0, 0], 0.3)), on: lum > 0.55 ? '#141414' : '#ffffff' };
  }
  /** Recolors every built-in background (and the launcher's accent) to `hex`; '' = each background's own colors. */
  function setColor(hex) { custom = hexRgb(hex) ? hex : ''; want = custom ? hsl(hexRgb(custom)) : null; kcache.clear(); }
  /** (old: colors used to be changed with a CSS filter, which was never exact - now the scenes draw your color themselves) */
  function filterFor() { return ''; }

  function applyTheme(id) {
    const th = (custom && themeFrom(custom)) || (scenes[id] || scenes.clean).theme;
    const r = document.documentElement.style;
    r.setProperty('--accent', th.accent);
    r.setProperty('--accent2', th.accent2);
    r.setProperty('--acc-rgb', th.rgb);
    r.setProperty('--acc-light', th.light);
    r.setProperty('--acc-dark', th.dark);
    r.setProperty('--on-accent', th.on);
    // a very light color (like pure white): the switches' white knob would vanish on it, so it goes dark
    const c = hexRgb(th.accent) || [0, 0, 0];
    const lum = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
    r.setProperty('--knob', lum > 0.9 ? '#15171d' : '#fff');
  }

  window.DuckBG = { scenes, mount, applyTheme, duck, setMode: (m) => { mode = m; }, setColor, filterFor, themeFrom, hsl, hexRgb, toHex };
})();

/* Asistan düğmesi — Konsept 1. Tek dosya, bağımsız. Kurulum: index.html > "Kurulum" bölümü. */
/* ===== KMCore — paylaşılan çekirdek. Her konsept dosyasında aynısı var; iki kez yüklenirse ikincisi atlanır. ===== */
(function () {
  if (window.KMCore) return;
  var TAU = Math.PI * 2;
  var mm = function (q) { return window.matchMedia ? matchMedia(q) : { matches: false }; };
  var reduce = mm('(prefers-reduced-motion: reduce)');
  var darkQ = mm('(prefers-color-scheme: dark)');
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mix(a, b, k) { return a + (b - a) * k; }
  function noise(t, s) { return Math.sin(t * 1.31 + s) * .5 + Math.sin(t * 2.17 + s * 1.7) * .3 + Math.sin(t * 3.73 + s * .37) * .2; }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function blob(ctx, x, y, r, c, a) {
    if (r <= 0 || a <= 0) return;
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(c, a)); g.addColorStop(.3, rgba(c, a * .72));
    g.addColorStop(.62, rgba(c, a * .26)); g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  function lerpColor(p, k) {
    k = ((k % 1) + 1) % 1; var n = p.length, f = k * n, i = Math.floor(f), u = f - i, a = p[i % n], b = p[(i + 1) % n];
    return [Math.round(mix(a[0], b[0], u)), Math.round(mix(a[1], b[1], u)), Math.round(mix(a[2], b[2], u))];
  }
  /* cam parlaması: üst yansıma + kenar çizgisi */
  function gloss(ctx, cx, cy, R, s) {
    s = s == null ? 1 : s;
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    ctx.translate(cx, cy - R * .52); ctx.scale(1, .55);
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, R * .62);
    g.addColorStop(0, 'rgba(255,255,255,' + (.42 * s) + ')'); g.addColorStop(.55, 'rgba(255,255,255,' + (.12 * s) + ')'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R * .62, 0, TAU); ctx.fill(); ctx.restore();
    ctx.save(); var lw = Math.max(1, R * .018);
    var lg = ctx.createLinearGradient(cx, cy - R, cx, cy + R);
    lg.addColorStop(0, 'rgba(255,255,255,' + (.5 * s) + ')'); lg.addColorStop(.5, 'rgba(255,255,255,' + (.05 * s) + ')'); lg.addColorStop(1, 'rgba(255,255,255,' + (.24 * s) + ')');
    ctx.strokeStyle = lg; ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(cx, cy, R - lw / 2, 0, TAU); ctx.stroke(); ctx.restore();
  }

  /* dikişsiz renkli halka çizgisi: fn(k 0..1) -> [renk, alfa] */
  function ring(ctx, cx, cy, r, lw, fn, segs) {
    ctx.lineWidth = lw;
    if (ctx.createConicGradient) {
      var g = ctx.createConicGradient(0, cx, cy), n = 48;
      for (var i = 0; i <= n; i++) { var v = fn(i / n); g.addColorStop(i / n, rgba(v[0], v[1])); }
      ctx.strokeStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke(); return;
    }
    segs = segs || 72;
    for (var k = 0; k < segs; k++) { var u = fn(k / segs); ctx.strokeStyle = rgba(u[0], u[1]); ctx.beginPath(); ctx.arc(cx, cy, r, k / segs * TAU, (k + 1.4) / segs * TAU); ctx.stroke(); }
  }
  /* ---------- ses genliği: gerçek mikrofon ya da simülasyon ---------- */
  var V = {
    micOn: false, mic: 0, simL: 0, simS: 0, _an: null, _buf: null, _st: null, _ac: null,
    startMic: function () {
      var self = this;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error('no-mic'));
      return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).then(function (st) {
        var AC = window.AudioContext || window.webkitAudioContext, ac = new AC();
        var an = ac.createAnalyser(); an.fftSize = 1024; an.smoothingTimeConstant = .2;
        ac.createMediaStreamSource(st).connect(an);
        self._ac = ac; self._st = st; self._an = an; self._buf = new Float32Array(an.fftSize); self.micOn = true;
        if (ac.state === 'suspended') ac.resume();
      });
    },
    stopMic: function () {
      if (this._st) this._st.getTracks().forEach(function (t) { t.stop(); });
      if (this._ac) try { this._ac.close(); } catch (e) {}
      this._st = this._ac = this._an = null; this.micOn = false; this.mic = 0;
    },
    tick: function (t) {
      if (this._an) {
        this._an.getFloatTimeDomainData(this._buf);
        var s = 0, b = this._buf; for (var i = 0; i < b.length; i++) s += b[i] * b[i];
        var v = Math.pow(clamp((Math.sqrt(s / b.length) - .008) * 11, 0, 1), .8);
        this.mic += (v - this.mic) * (v > this.mic ? .55 : .12);
      }
      var gate = clamp(Math.sin(t * .83) * 1.6 + .7, 0, 1), syl = Math.abs(Math.sin(t * 5.7 + Math.sin(t * 1.9) * 2.2));
      var l = gate * (.22 + .62 * syl * (.65 + .35 * Math.sin(t * 2.3 + 1))); this.simL += (l - this.simL) * .25;
      var g2 = clamp(Math.sin(t * .61 + 2) * 1.8 + .9, 0, 1), s2 = Math.abs(Math.sin(t * 8.3)) * (.55 + .45 * Math.sin(t * 1.37));
      var sp = g2 * (.2 + .6 * s2); this.simS += (sp - this.simS) * .3;
    },
    level: function (st) { return st === 'listening' ? (this.micOn ? this.mic : this.simL) : st === 'speaking' ? this.simS : 0; }
  };

  /* ---------- canlı örnekler ---------- */
  var list = [], edges = [], last = 0, frame = 0, T = 0, started = false;
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.target._km) e.target._km.vis = e.isIntersecting; }); }, { rootMargin: '160px' }) : null;
  var ro = 'ResizeObserver' in window ? new ResizeObserver(function (es) { es.forEach(function (e) { if (e.target._km) size(e.target._km); }); }) : null;
  function stateOf(el) {
    var o = el.closest('[data-km-state],.listening,.thinking,.speaking'); if (!o) return 'idle';
    if (o.hasAttribute('data-km-state')) return o.getAttribute('data-km-state');
    var c = o.classList; return c.contains('listening') ? 'listening' : c.contains('thinking') ? 'thinking' : 'speaking';
  }
  function themeOf(el) {
    var o = el.closest('[data-km-theme]'); if (o) return o.getAttribute('data-km-theme') === 'dark';
    var r = document.documentElement.getAttribute('data-theme'); if (r === 'dark' || r === 'light') return r === 'dark';
    return darkQ.matches;
  }
  function size(k) {
    var s = k.el.clientWidth || 76, dpr = Math.min(2, window.devicePixelRatio || 1), css = s * (1 + 2 * k.def.pad);
    k.cv.style.width = k.cv.style.height = css + 'px';
    k.cv.style.left = k.cv.style.top = (-(css - s) / 2) + 'px';
    k.cv.width = k.cv.height = Math.round(css * dpr); k.dpr = dpr; k.css = css; k.s = s;
  }
  function mount(el, def) {
    if (el._km) return el._km;
    el.classList.add('km-host');
    var cv = document.createElement('canvas'); cv.className = 'km-cv'; cv.setAttribute('aria-hidden', 'true');
    el.appendChild(cv);
    var k = { el: el, cv: cv, ctx: cv.getContext('2d'), def: def, w: { i: 1, l: 0, t: 0, s: 0 }, ph: Math.random() * 10, amp: 0, vis: true, st: 'idle', dark: false };
    k.st = stateOf(el); k.dark = themeOf(el);
    el._km = k; size(k); list.push(k);
    if (io) io.observe(el); if (ro) ro.observe(el);
    if (def.onMount) def.onMount(el);
    start(); return k;
  }
  function render(k) {
    var c = k.ctx; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, k.cv.width, k.cv.height);
    c.setTransform(k.dpr, 0, 0, k.dpr, 0, 0); c.globalCompositeOperation = 'source-over';
    var h = k.css / 2;
    k.def.draw(c, { cx: h, cy: h, R: k.s / 2, t: T, ph: k.ph, amp: k.amp, w: k.w, dark: k.dark, small: k.s < 40 });
    c.globalCompositeOperation = 'source-over';
  }
  function loop(now) {
    requestAnimationFrame(loop);
    var dt = last ? Math.min(.05, (now - last) / 1000) : .016; last = now;
    var rm = reduce.matches, sp = rm ? .3 : 1; T += dt * sp; V.tick(T); frame++;
    var e = 1 - Math.exp(-dt * 5);
    for (var n = 0; n < list.length; n++) {
      var k = list[n]; if (!k.vis || !k.el.isConnected) continue;
      if (frame % 10 === 1) { k.st = stateOf(k.el); k.dark = themeOf(k.el); }
      var w = k.w, key = k.st.charAt(0) === 'l' ? 'l' : k.st.charAt(0) === 't' ? 't' : k.st.charAt(0) === 's' ? 's' : 'i';
      for (var q in w) w[q] += ((q === key ? 1 : 0) - w[q]) * e;
      var a = V.level(k.st) * (rm ? .5 : 1); k.amp += (a - k.amp) * (a > k.amp ? .45 : .15);
      k.ph += dt * sp * (k.def.speed ? k.def.speed(w, k.amp) : (.45 * w.i + .9 * w.l + 2.4 * w.t + .8 * w.s + .9 * k.amp));
      render(k);
    }
    if (frame % 60 === 1) edges = Array.prototype.slice.call(document.querySelectorAll('.km-edge,.km-pill'));
    if (frame % 2 === 0) for (var j = 0; j < edges.length; j++) {
      var ed = edges[j], st = stateOf(ed), av = Math.round(V.level(st) * (rm ? .4 : 1) * 100) / 100;
      if (ed._a !== av) { ed._a = av; ed.style.setProperty('--km-amp', av); }
    }
  }
  function start() { if (started) return; started = true; requestAnimationFrame(loop); }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  /* uygulama simgesi / favicon çizimi */
  function icon(def, cv, px, o) {
    o = o || {}; var dpr = o.dpr || 1; cv.width = cv.height = Math.round(px * dpr);
    var c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); var dark = o.theme === 'dark';
    c.save(); roundRect(c, 0, 0, px, px, px * .2237); c.clip();
    var g = c.createLinearGradient(0, 0, 0, px);
    if (dark) { g.addColorStop(0, '#26232f'); g.addColorStop(1, '#050507'); } else { g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#e7e9f0'); }
    c.fillStyle = g; c.fillRect(0, 0, px, px);
    if (def.iconBg) def.iconBg(c, px, dark);
    var I = def.icon || {};
    /* işaret ayrı saydam katmanda çizilir; 'lighter' karışımı açık zeminde kaybolmasın */
    var off = document.createElement('canvas'); off.width = off.height = cv.width;
    var oc = off.getContext('2d'); oc.setTransform(dpr, 0, 0, dpr, 0, 0);
    def.draw(oc, { cx: px / 2, cy: px / 2, R: px * (o.small ? (I.smallR || .4) : (I.r || .3)), t: I.t || 3, ph: I.ph || 2, amp: I.amp == null ? .3 : I.amp, w: I.w || { i: .6, l: .4, t: 0, s: 0 }, dark: dark, small: !!o.small, icon: true });
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.drawImage(off, 0, 0);
    c.restore(); c.globalCompositeOperation = 'source-over';
    return cv;
  }

  var baseCSS =
    '.km-host{position:relative;isolation:isolate;-webkit-tap-highlight-color:transparent}' +
    '.km-cv{position:absolute;pointer-events:none;z-index:1}' +
    '.km-btn{width:76px;height:76px;border-radius:50%;border:0;background:none;padding:0;cursor:pointer;display:block;transition:transform .35s cubic-bezier(.22,.8,.26,1)}' +
    '.km-btn:active{transform:scale(.95)}' +
    '.km-btn:focus-visible{outline:2px solid currentColor;outline-offset:6px}' +
    '@property --km-a{syntax:"<angle>";inherits:true;initial-value:0deg}' +
    '@property --km-p{syntax:"<number>";inherits:true;initial-value:0}' +
    '@keyframes km-spin{to{--km-a:360deg}}' +
    '.km-edge{position:fixed;inset:0;pointer-events:none;z-index:50;opacity:0;transition:opacity .6s cubic-bezier(.22,.8,.26,1);border-radius:inherit;overflow:hidden;--km-amp:0}' +
    '.km-edge>i{position:absolute;inset:0;border-radius:inherit;display:block}' +
    '.listening .km-edge{opacity:1}.thinking .km-edge{opacity:.55}.speaking .km-edge{opacity:.4}' +
    /* yumuşak bant: dört kenardan içeri sönen maske */
    '.km-f{-webkit-mask:linear-gradient(to right,#000,rgba(0,0,0,.35) calc(var(--bw)*.45),transparent var(--bw)),linear-gradient(to left,#000,rgba(0,0,0,.35) calc(var(--bw)*.45),transparent var(--bw)),linear-gradient(to bottom,#000,rgba(0,0,0,.35) calc(var(--bw)*.45),transparent var(--bw)),linear-gradient(to top,#000,rgba(0,0,0,.35) calc(var(--bw)*.45),transparent var(--bw));' +
    'mask:linear-gradient(to right,#000,rgba(0,0,0,.35) calc(var(--bw)*.45),transparent var(--bw)),linear-gradient(to left,#000,rgba(0,0,0,.35) calc(var(--bw)*.45),transparent var(--bw)),linear-gradient(to bottom,#000,rgba(0,0,0,.35) calc(var(--bw)*.45),transparent var(--bw)),linear-gradient(to top,#000,rgba(0,0,0,.35) calc(var(--bw)*.45),transparent var(--bw))}' +
    /* ince çizgi: köşe yuvarlaklığını izleyen kenar */
    '.km-h{padding:var(--bw,2px);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}' +
    '@media (prefers-reduced-motion:reduce){.km-edge,.km-edge>i,.km-pill,.km-pill *{animation:none!important;transition:opacity .2s linear!important}}';
  var st = document.createElement('style'); st.id = 'km-core-css'; st.textContent = baseCSS;
  (document.head || document.documentElement).appendChild(st);

  var defs = {};
  function reg(id, def) {
    defs[id] = def;
    if (def.css) { var s = document.createElement('style'); s.textContent = def.css; (document.head || document.documentElement).appendChild(s); }
    def.mount = function (el) { return mount(el, def); };
    def.icon_ = function (cv, px, o) { return icon(def, cv, px, o); };
    def.fillEdge = function (el) {
      if (el.children.length) return el;
      (def.edgeLayers || []).forEach(function (cls) { var i = document.createElement('i'); i.className = cls; el.appendChild(i); });
      return el;
    };
    function auto() {
      document.querySelectorAll('[data-km="' + id + '"]').forEach(function (el) { def.mount(el); });
      document.querySelectorAll('.km-edge-' + id).forEach(def.fillEdge);
      if (def.onAuto) def.onAuto();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto();
    window.KM = window.KM || {}; window.KM[id] = def;
    return def;
  }
  window.KMVoice = V;
  window.KMCore = { reg: reg, mount: mount, icon: icon, blob: blob, gloss: gloss, ring: ring, rgba: rgba, mix: mix, clamp: clamp, noise: noise, lerpColor: lerpColor, roundRect: roundRect, TAU: TAU, reduce: reduce };
})();
(function () {
  var K = KMCore, TAU = K.TAU, blob = K.blob, mix = K.mix, noise = K.noise, lerpColor = K.lerpColor, gloss = K.gloss, rgba = K.rgba;
  var P = { pink: [255, 62, 165], mag: [236, 72, 255], vio: [139, 92, 246], blue: [56, 110, 255], cyan: [40, 200, 255], orng: [255, 150, 64], white: [255, 255, 255] };
  /* 1 · SIVI KÜRE */
  K.reg(1, {
    pad: .45,
    icon: { r: .3, amp: .35, ph: 2.2 },
    draw: function (c, S) {
      var cx = S.cx, cy = S.cy, R = S.R, w = S.w, a = S.amp, ph = S.ph, act = w.l + w.s;
      var Rs = R * (.9 + .06 * a * act - .03 * w.t);
      c.globalCompositeOperation = 'lighter';
      var ha = (S.dark ? .28 : .15) + .24 * a * act + .12 * w.t;
      var hc = [P.pink, P.blue, P.vio];
      for (var h = 0; h < 3; h++) blob(c, cx + Math.cos(ph * .4 + h * 2.1) * R * .22, cy + Math.sin(ph * .4 + h * 2.1) * R * .18, Rs * (1.7 + .35 * a * act), hc[h], ha * (h ? .9 : .8));
      c.globalCompositeOperation = 'source-over';
      c.save(); c.beginPath(); c.arc(cx, cy, Rs, 0, TAU); c.clip();
      var g = c.createRadialGradient(cx, cy + Rs * .25, 0, cx, cy, Rs);
      g.addColorStop(0, '#2b2066'); g.addColorStop(1, '#06051a'); c.fillStyle = g; c.fillRect(cx - Rs, cy - Rs, Rs * 2, Rs * 2);
      c.globalCompositeOperation = 'lighter';
      var B = [[P.pink, .66, .42, 1, 0, .9], [P.vio, .74, .36, .78, 2.1, .8], [P.blue, .7, .46, 1.17, 4.2, .9], [P.cyan, .5, .52, 1.42, 1.1, .85], [P.orng, .38, .54, .93, 3.3, .7]];
      for (var i = 0; i < B.length; i++) {
        var b = B[i], an = ph * b[3] + b[4];
        var orb = Rs * mix(b[2] * (1 + .3 * a * act), .52, w.t), br = Rs * b[1] * mix(1 + .3 * a * act, .6, w.t);
        var x = cx + Math.cos(an) * orb + Math.sin(an * 1.7 + b[4]) * Rs * .08, y = cy + Math.sin(an * 1.31) * orb * .92;
        blob(c, x, y, br, b[0], b[5] * (1 + .25 * a * act));
      }
      blob(c, cx, cy, Rs * (.35 + .4 * a * act + .1 * w.t), [255, 236, 250], .16 + .5 * a * act);
      c.globalCompositeOperation = 'source-over';
      var v = c.createRadialGradient(cx, cy - Rs * .1, Rs * .5, cx, cy, Rs);
      v.addColorStop(0, 'rgba(5,3,16,0)'); v.addColorStop(1, 'rgba(5,3,16,.62)'); c.fillStyle = v; c.fillRect(cx - Rs, cy - Rs, Rs * 2, Rs * 2);
      c.globalCompositeOperation = 'lighter';
      c.save(); c.translate(cx, cy + Rs * .8); c.scale(1, .4); blob(c, 0, 0, Rs * .75, [255, 205, 240], .3 + .2 * a); c.restore();
      c.restore();
      gloss(c, cx, cy, Rs, 1);
    },
    edgeLayers: ['a km-f', 'b km-f'],
    css: '.km-edge-1 .a{background:conic-gradient(from var(--km-a),#ff3ea5,#8b5cf6,#386eff,#28c8ff,#ff3ea5);--bw:calc(28px + var(--km-amp,0)*48px);animation:km-spin 9s linear infinite}' +
      '.km-edge-1 .b{background:conic-gradient(from var(--km-a),transparent,#ff9640 12%,#ec48ff 22%,transparent 38%,#28c8ff 66%,transparent 82%);--bw:calc(16px + var(--km-amp,0)*30px);mix-blend-mode:screen;mix-blend-mode:plus-lighter;opacity:.85;animation:km-spin 13s linear infinite reverse}'
  });
})();

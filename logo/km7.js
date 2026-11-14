/* Asistan düğmesi — Konsept 7. Tek dosya, bağımsız. Kurulum: index.html > "Kurulum" bölümü. */
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
  /* 7 · KOYU CAM KÜRE — tek renkli sıvı cam */
  var W7 = [255, 255, 255];
  function setupLens() {
    if (document.getElementById('km7-svg')) return;
    /* Chromium: backdrop-filter:url() ile gerçek kırılma. Diğerlerinde bulanık+koyu cam yedeği. */
    var ok = !!window.chrome && !/Firefox/.test(navigator.userAgent);
    var cv = document.createElement('canvas'), N = 128; cv.width = cv.height = N;
    var x = cv.getContext('2d'), im = x.createImageData(N, N);
    for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) {
      var nx = (i + .5) / N * 2 - 1, ny = (j + .5) / N * 2 - 1, r = Math.sqrt(nx * nx + ny * ny), o = (j * N + i) * 4;
      var f = r < 1 ? Math.pow(r, 2.2) * .9 : 0, dx = r ? nx / r : 0, dy = r ? ny / r : 0;
      im.data[o] = Math.round(128 - 127 * dx * f); im.data[o + 1] = Math.round(128 - 127 * dy * f); im.data[o + 2] = 128; im.data[o + 3] = 255;
    }
    x.putImageData(im, 0, 0);
    var ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('id', 'km7-svg'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    svg.innerHTML = '<filter id="km7-refract" x="0" y="0" width="1" height="1" filterUnits="objectBoundingBox" primitiveUnits="objectBoundingBox" color-interpolation-filters="sRGB">' +
      '<feImage href="' + cv.toDataURL() + '" x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="m"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="m" scale=".22" xChannelSelector="R" yChannelSelector="G"/></filter>';
    document.body.appendChild(svg);
    if (ok) document.documentElement.classList.add('km7-svg');
  }
  K.reg(7, {
    pad: .4,
    icon: { r: .31, amp: .35, ph: 2.4, smallR: .43 },
    speed: function (w, a) { return .35 * w.i + .8 * w.l + 3.0 * w.t + .9 * w.s + .7 * a; },
    onMount: function (el) {
      if (el.querySelector('.km7-lens')) return;
      var l = document.createElement('span'); l.className = 'km7-lens'; l.setAttribute('aria-hidden', 'true'); el.insertBefore(l, el.firstChild);
      if (document.body) setupLens(); else document.addEventListener('DOMContentLoaded', setupLens);
    },
    iconBg: function (c, px, dark) {
      /* simge zemini: kürenin arkasında yumuşak bir ışık havuzu */
      var g = c.createRadialGradient(px / 2, px * .42, 0, px / 2, px * .5, px * .62);
      g.addColorStop(0, dark ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, px, px);
    },
    draw: function (c, S) {
      var cx = S.cx, cy = S.cy, R = S.R, w = S.w, a = S.amp, ph = S.ph, t = S.t, act = w.l + w.s, d = S.dark;
      var breath = .5 + .5 * Math.sin(t * 1.4);
      var Rs = R * .92 * (1 + .045 * a * act + .025 * w.l - .015 * w.t);
      /* gölge / hale */
      if (!d) { c.save(); c.translate(cx, cy + Rs * .38); c.scale(1, .5); blob(c, 0, 0, Rs * 1.15, [10, 10, 20], .22); c.restore(); }
      c.globalCompositeOperation = 'lighter';
      blob(c, cx, cy, Rs * 1.6, W7, (d ? .07 : .0) + (d ? .14 : .05) * a * act + (d ? .05 : 0) * w.t);
      c.globalCompositeOperation = 'source-over';
      c.save(); c.beginPath(); c.arc(cx, cy, Rs, 0, TAU); c.clip();
      var g = c.createRadialGradient(cx, cy - Rs * .15, 0, cx, cy, Rs);
      var base = S.icon ? 1 : .82;
      g.addColorStop(0, 'rgba(34,34,40,' + (.5 * base) + ')'); g.addColorStop(.62, 'rgba(8,8,10,' + (.84 * base) + ')'); g.addColorStop(1, 'rgba(0,0,0,' + (.97 * base) + ')');
      c.fillStyle = g; c.fillRect(cx - Rs, cy - Rs, Rs * 2, Rs * 2);
      c.globalCompositeOperation = 'lighter';
      /* gri kostikler */
      var ca = (.13 + .06 * breath * w.i + .25 * a * act + .08 * w.t);
      for (var i = 0; i < 3; i++) {
        var an = ph * (1 + i * .35) + i * 2.1;
        c.save(); c.translate(cx + Math.cos(an) * Rs * .32, cy + Math.sin(an) * Rs * .3); c.rotate(an + 1.2); c.scale(1, .2);
        blob(c, 0, 0, Rs * (.7 + .2 * a * act), W7, ca * 1.2); c.restore();
      }
      /* ince iç ışık yayları */
      c.lineCap = 'round';
      for (var q = 0; q < 2; q++) {
        var a0 = ph * (q ? -.7 : .9) + q * 3.1, rr = Rs * (q ? .62 : .8);
        var ag = c.createLinearGradient(cx + Math.cos(a0) * rr, cy + Math.sin(a0) * rr, cx + Math.cos(a0 + 1.6) * rr, cy + Math.sin(a0 + 1.6) * rr);
        var al = (q ? .18 : .32) * (.7 + .3 * breath * w.i) + .35 * a * act + .1 * w.t;
        ag.addColorStop(0, 'rgba(255,255,255,0)'); ag.addColorStop(.5, 'rgba(255,255,255,' + al + ')'); ag.addColorStop(1, 'rgba(255,255,255,0)');
        c.strokeStyle = ag; c.lineWidth = Math.max(1, Rs * (q ? .018 : .028)); c.beginPath(); c.arc(cx, cy, rr, a0, a0 + 1.6); c.stroke();
      }
      blob(c, cx, cy + Rs * .1, Rs * (.42 + .4 * a * act), W7, .05 + .07 * breath * w.i + .32 * a * act + .06 * w.t);
      /* iç kenar ışığı */
      var rim = c.createRadialGradient(cx, cy, Rs * .72, cx, cy, Rs);
      rim.addColorStop(0, 'rgba(255,255,255,0)'); rim.addColorStop(.8, 'rgba(255,255,255,' + (.08 + .1 * a * act) + ')'); rim.addColorStop(1, 'rgba(255,255,255,' + (.28 + .2 * a * act) + ')');
      c.fillStyle = rim; c.fillRect(cx - Rs, cy - Rs, Rs * 2, Rs * 2);
      c.save(); c.translate(cx, cy + Rs * .86); c.scale(1, .24); blob(c, 0, 0, Rs * .78, W7, .62 + .25 * a * act); c.restore();
      c.globalCompositeOperation = 'source-over';
      c.restore();
      /* yansımalar */
      c.save(); c.translate(cx, cy - Rs * .55); c.scale(1, .5);
      var sg = c.createRadialGradient(0, 0, 0, 0, 0, Rs * .7);
      sg.addColorStop(0, 'rgba(255,255,255,.42)'); sg.addColorStop(.6, 'rgba(255,255,255,.1)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = sg; c.beginPath(); c.arc(0, 0, Rs * .7, 0, TAU); c.fill(); c.restore();
      c.save(); c.translate(cx - Rs * .38, cy - Rs * .5); c.rotate(-.65); c.scale(1, .42);
      var hg = c.createRadialGradient(0, 0, 0, 0, 0, Rs * .26);
      hg.addColorStop(0, 'rgba(255,255,255,.95)'); hg.addColorStop(.45, 'rgba(255,255,255,.45)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = hg; c.beginPath(); c.arc(0, 0, Rs * .26, 0, TAU); c.fill(); c.restore();
      blob(c, cx + Rs * .5, cy + Rs * .52, Rs * .07, W7, .55);
      var lw = Math.max(1, R * .016);
      var lg = c.createLinearGradient(cx - Rs * .6, cy - Rs, cx + Rs * .6, cy + Rs);
      lg.addColorStop(0, 'rgba(255,255,255,.75)'); lg.addColorStop(.45, 'rgba(255,255,255,.06)'); lg.addColorStop(.8, 'rgba(255,255,255,.1)'); lg.addColorStop(1, 'rgba(255,255,255,.5)');
      c.strokeStyle = lg; c.lineWidth = lw; c.beginPath(); c.arc(cx, cy, Rs - lw / 2, 0, TAU); c.stroke();
      if (!d) { c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = Math.max(.6, R * .006); c.beginPath(); c.arc(cx, cy, Rs + c.lineWidth / 2, 0, TAU); c.stroke(); }
    },
    edgeLayers: ['b km-f', 'a km-f', 'h km-h'],
    css:
      '.km7-lens{position:absolute;inset:4%;border-radius:50%;z-index:0;pointer-events:none;-webkit-backdrop-filter:blur(2px) brightness(.6) contrast(1.3) saturate(0);backdrop-filter:blur(2px) brightness(.6) contrast(1.3) saturate(0)}' +
      '.km7-svg .km7-lens{backdrop-filter:url(#km7-refract) blur(.5px) brightness(.62) contrast(1.3) saturate(0)}' +
      '.km-edge-7{--ink:255,255,255}' +
      '@media (prefers-color-scheme:light){html:not([data-theme=dark]) .km-edge-7{--ink:38,38,44}}' +
      'html[data-theme=light] .km-edge-7,[data-km-theme=light] .km-edge-7{--ink:38,38,44}html[data-theme=dark] .km-edge-7,[data-km-theme=dark] .km-edge-7{--ink:255,255,255}' +
      '.km-edge-7 .a,.km-edge-7 .h{background:conic-gradient(from var(--km-a),rgba(var(--ink),.12),rgba(var(--ink),.95) 10%,rgba(var(--ink),.25) 22%,rgba(var(--ink),.08) 40%,rgba(var(--ink),.12) 50%,rgba(var(--ink),.85) 61%,rgba(var(--ink),.2) 73%,rgba(var(--ink),.12));animation:km-spin 5.5s linear infinite}' +
      '.km-edge-7 .a{--bw:calc(16px + var(--km-amp,0)*30px)}.km-edge-7 .h{--bw:2px}' +
      '.km-edge-7 .b{background:rgba(var(--ink),.14);--bw:calc(60px + var(--km-amp,0)*70px)}' +
      '@media (prefers-color-scheme:light){html:not([data-theme=dark]) .km-edge-7 .b{opacity:0}html:not([data-theme=dark]) .km-edge-7 .a{opacity:.42;--bw:calc(12px + var(--km-amp,0)*22px)}}html[data-theme=light] .km-edge-7 .b{opacity:0}html[data-theme=light] .km-edge-7 .a{opacity:.42;--bw:calc(12px + var(--km-amp,0)*22px)}' +
      '.thinking .km-edge-7 .a,.thinking .km-edge-7 .h{animation-duration:2.2s}' +
      /* üstten çıkan hap (Dynamic Island benzeri) */
      '.km-pill{position:fixed;top:calc(env(safe-area-inset-top,0px) + 11px);left:50%;width:108px;height:32px;transform:translateX(-50%);border-radius:999px;background:#000;overflow:hidden;z-index:60;pointer-events:none;transition:width .6s cubic-bezier(.3,1.35,.5,1),height .6s cubic-bezier(.3,1.35,.5,1),top .6s cubic-bezier(.3,1.35,.5,1),box-shadow .5s,background .5s;--km-amp:0}' +
      '.km-pill>*{position:absolute;display:block;opacity:0;transition:opacity .4s}' +
      '.listening .km-pill,.thinking .km-pill,.speaking .km-pill{width:min(232px,70%);height:60px;top:calc(env(safe-area-inset-top,0px) + 6px);background:radial-gradient(120% 140% at 30% 0,rgba(70,70,78,.55),rgba(8,8,10,.86) 60%);-webkit-backdrop-filter:blur(16px) saturate(0) brightness(.7);backdrop-filter:blur(16px) saturate(0) brightness(.7);box-shadow:inset 0 1px 0 rgba(255,255,255,.4),inset 0 -1px 1px rgba(255,255,255,.18),inset 0 0 0 .5px rgba(255,255,255,.18),0 14px 34px rgba(0,0,0,.35)}' +
      '.listening .km-pill>*,.thinking .km-pill>*,.speaking .km-pill>*{opacity:1}' +
      '.km-pill .km-btn{width:44px;height:44px;left:8px;top:8px}' +
      '.km-pill .s{inset:0;background:linear-gradient(100deg,transparent 30%,rgba(255,255,255,.22) 46%,rgba(255,255,255,.04) 54%,transparent 68%);background-size:260% 100%;animation:km7-sheen 3.6s linear infinite}' +
      '.thinking .km-pill .s{animation-duration:1.3s}' +
      '.km-pill .g{left:62px;right:18px;top:50%;height:3px;margin-top:-1.5px;border-radius:3px;background:linear-gradient(90deg,rgba(255,255,255,.1),rgba(255,255,255,.85),rgba(255,255,255,.1));transform:scaleY(calc(1 + var(--km-amp,0)*7));transform-origin:center;transition:transform .1s linear,opacity .4s;box-shadow:0 0 12px rgba(255,255,255,.35)}' +
      '.thinking .km-pill .g{animation:km7-think 1.2s ease-in-out infinite}' +
      '@keyframes km7-sheen{from{background-position:130% 0}to{background-position:-130% 0}}' +
      '@keyframes km7-think{0%,100%{opacity:.35}50%{opacity:1}}'
  });
})();

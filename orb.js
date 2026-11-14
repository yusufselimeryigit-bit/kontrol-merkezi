/* =====================================================================
   ORB BİLEŞENİ  ·  logo uyarlayıcısı (konseptler/logo2 → logo/km1.js, logo/km7.js)
   ---------------------------------------------------------------------
   Sözleşme:
     KMOrb.mount(buttonEl)   → düğmenin içine seçili km logosunu koyar + kenar ışığı
     KMOrb.setState(durum)   → 'idle' | 'listening' | 'thinking' | 'speaking'
                               (km çizimleri body.listening/.thinking/.speaking sınıflarını okur)
     KMOrb.setLogo(1|7)      → logoyu anında değiştirir (localStorage 'km-logo')
     KMOrb.setPill(bool)     → yalnız 7: "üstten hap" konumu (localStorage 'km-logo-pill')
     KMOrb.micStart/micStop  → gerçek mikrofon genliği (iOS/Android'de simülasyon)
   Not: tıklama olayları <button id="orb">'da kalsın diye km-btn düğmenin içindeki
   bir <span class="km-btn" data-km="N">'dır; logo değişince yalnız bu span yenilenir.
   ===================================================================== */
(function () {
'use strict';
const KEY = 'km-logo', PILL = 'km-logo-pill';
const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
const CSS = `
.orb{width:76px;height:76px;border-radius:50%;display:grid;place-items:center;padding:0;position:relative}
.orb > .km-btn{pointer-events:none}
.orb:active > .km-btn{transform:scale(.95)}
.orb:focus-visible{outline:2px solid var(--link,#0058CC);outline-offset:6px}
body.km-hap.listening .orb,body.km-hap.thinking .orb,body.km-hap.speaking .orb{opacity:.35;transition:opacity .3s}
.km-pill{z-index:40;pointer-events:none}`;
const st = document.createElement('style'); st.id = 'km-orb-css'; st.textContent = CSS; document.head.appendChild(st);

let btn = null, state = 'idle';
const logo = () => (ls.get(KEY) === '1' ? 1 : 7);
const pillOn = () => logo() === 7 && ls.get(PILL) === '1';
const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

function apply() {
  const n = logo(), KM = window.KM || {};
  if (!KM[n]) return;
  /* kenar ışığı: yalnız seçili konseptinki */
  let edge = document.getElementById('kmEdge');
  const fresh = document.createElement('div');
  fresh.id = 'kmEdge'; fresh.className = 'km-edge km-edge-' + n; fresh.setAttribute('aria-hidden', 'true');
  if (edge) edge.replaceWith(fresh); else document.body.prepend(fresh);
  KM[n].fillEdge(fresh);
  /* düğme */
  if (btn) {
    btn.innerHTML = '';
    const host = document.createElement('span');
    host.className = 'km-btn'; host.dataset.km = n; host.setAttribute('aria-hidden', 'true');
    btn.appendChild(host); KM[n].mount(host);
    btn.dataset.kmLogo = n;
  }
  /* üstten hap (yalnız 7) */
  const old = document.querySelector('.km-pill'); if (old) old.remove();
  document.body.classList.toggle('km-hap', pillOn());
  if (pillOn()) {
    const p = document.createElement('div');
    p.className = 'km-pill'; p.setAttribute('aria-hidden', 'true');
    p.innerHTML = '<i class="s"></i><i class="g"></i><span class="km-btn" data-km="7"></span>';
    document.body.appendChild(p); KM[7].mount(p.querySelector('.km-btn'));
  }
}

window.KMOrb = {
  mount(el) { btn = el; el.classList.add('orb'); el.dataset.state = state; document.body.dataset.kmState = 'idle'; apply(); },
  /* Kullanıcı isteği: etkin durumların hepsinde ışık yalnızca DÖNER (düşünme davranışı);
     sesle büyüme/şişme yok. km çizimleri en yakın [data-km-state]'i okur → body'ye yazıyoruz. */
  setState(s) {
    state = ['idle', 'listening', 'thinking', 'speaking'].includes(s) ? s : 'idle';
    if (btn) btn.dataset.state = state;
    document.body.dataset.kmState = state === 'idle' ? 'idle' : 'thinking';
  },
  get state() { return state; },
  get logo() { return logo(); },
  get pill() { return pillOn(); },
  setLogo(n) { ls.set(KEY, String(n === 1 ? 1 : 7)); apply(); },
  setPill(on) { ls.set(PILL, on ? '1' : '0'); apply(); },
  mountPreview(el, n) { const KM = window.KM || {}; if (KM[n]) KM[n].mount(el); },
  /* Genlik artık görselleri etkilemiyor (büyüme istenmedi); mikrofon ikinci kez açılmaz.
     İleride gerekirse: masaüstünde KMVoice.startMic() — iOS/Android'de simülasyonda kal. */
  micStart() {}, micStop() {},
  _isMobile: isMobile
};
})();

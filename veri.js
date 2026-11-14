/* =====================================================================
   Kontrol Merkezi · canlı veri katmanı (SALT OKUNUR)
   ---------------------------------------------------------------------
   Dört kaynak, hepsi yalnızca OKUNUR; hiçbir yere yazılmaz:
   1) YKS Takip   — Firebase RTDB REST (yksTakip/<alt>.json)
   2) DeutschFlow — Firebase RTDB REST (deutschflow/data/<profil>/<alt>.json)
   3) Cüzdan      — Firestore (e-posta/şifre ile oturum, resmi SDK)
                    users/{uid}/summary/now + users/{uid}/cuzdan/meta,c0..cN
   4) KriptoBot   — Cloudflare Worker CSV (/export.csv?token=…)
   Son okunan özetler localStorage'da (km-cache-v1) çevrimdışı için saklanır.
   ===================================================================== */
(function () {
'use strict';

const YKS_DB = 'https://yks-takip-e070d-default-rtdb.firebaseio.com/yksTakip';
const DE_PROFILE = 'pmvr4yau4ufl7n';
const DE_DB = 'https://deutschflow-f8eed-default-rtdb.europe-west1.firebasedatabase.app/deutschflow/data/' + DE_PROFILE;
/* Cüzdan'ın kendi index.html'indeki Cloud.EMBED ile aynı (herkese açık istemci yapılandırması) */
const CZ_CFG = { apiKey: 'AIzaSyCEMo1bzaESJH8xVJNK_9XHhCT98kuHbiI', authDomain: 'cuzdan-jxtsq.firebaseapp.com', projectId: 'cuzdan-jxtsq', storageBucket: 'cuzdan-jxtsq.firebasestorage.app', messagingSenderId: '299055524443', appId: '1:299055524443:web:6f1df4956928efdea02d7e' };
const FB_VER = '10.12.2';   // Cüzdan ile aynı sürüm

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  str(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } },
  setStr(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) {} }
};

/* ---------- küçük yardımcılar ---------- */
const pad = n => String(n).padStart(2, '0');
const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (s, k) => { const [y, m, d] = s.split('-').map(Number); return ymd(new Date(y, m - 1, d + k)); };
const dayDiff = (a, b) => Math.round((Date.parse(b + 'T12:00:00') - Date.parse(a + 'T12:00:00')) / 864e5);
const num = v => (typeof v === 'number' && isFinite(v)) ? v : (typeof v === 'string' && v.trim() !== '' && isFinite(+v) ? +v : 0);
const arr = v => Array.isArray(v) ? v.filter(Boolean) : (v && typeof v === 'object') ? Object.values(v).filter(Boolean) : [];
const r2 = n => Math.round((+n || 0) * 100) / 100;
const hhmm = t => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

async function getJSON(url, ms = 15000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal, cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('zaman aşımı');
    if (e instanceof TypeError) throw new Error(navigator.onLine === false ? 'internet yok' : 'sunucuya ulaşılamadı');
    throw e;
  } finally { clearTimeout(t); }
}

/* =====================================================================
   1) YKS TAKİP  (alan anlamları indexyks.html'den)
   ===================================================================== */
const YKS_KEYS = ['exams', 'activities', 'settings', 'planBlocks', 'flashcards', 'offDays', 'shieldDays', 'wrongNotes', 'curriculum', 'homework', 'denemeTakvimi'];
const EXAM_LEAVES = {   // EXAM_SECTIONS'ın en alt düzeyi
  TYT: [['tr', 'Türkçe'], ['mat', 'Temel Matematik'], ['fiz', 'Fizik'], ['kim', 'Kimya'], ['biy', 'Biyoloji'], ['tarih', 'Tarih'], ['cog', 'Coğrafya'], ['fel', 'Felsefe'], ['din', 'Din Kültürü']],
  AYT: [['edb', 'Edebiyat'], ['mat', 'Matematik'], ['tarih', 'Tarih'], ['cog', 'Coğrafya']],
  SAY: [['mat', 'Matematik'], ['fiz', 'Fizik'], ['kim', 'Kimya'], ['biy', 'Biyoloji']]
};
const NET_KEYS = { TYT: ['tr', 'mat', 'fen', 'sos', 'fiz', 'kim', 'biy', 'tarih', 'cog', 'fel', 'din'], AYT: ['edb', 'mat', 'tarih', 'cog'], SAY: ['mat', 'fiz', 'kim', 'biy'] };
const NET_LABEL = { tr: 'Türkçe', mat: 'Matematik', fen: 'Fen', sos: 'Sosyal', fiz: 'Fizik', kim: 'Kimya', biy: 'Biyoloji', tarih: 'Tarih', cog: 'Coğrafya', fel: 'Felsefe', din: 'Din', edb: 'Edebiyat' };
const GENERIC_TOPICS = ['Genel Konu', 'Plandan eklendi', 'Plandan otomatik eklendi'];

async function loadYKS() {
  const vals = await Promise.all(YKS_KEYS.map(k => getJSON(`${YKS_DB}/${k}.json`)));
  const raw = {}; YKS_KEYS.forEach((k, i) => raw[k] = vals[i]);
  return deriveYKS(raw);
}

function deriveYKS(raw, now = new Date()) {
  const today = ymd(now), st = raw.settings || {};
  const examOut = e => {
    if (!e) return null;
    const nets = {};
    (NET_KEYS[e.type] || []).forEach(k => {
      const v = e.nets && e.nets[k] !== undefined ? e.nets[k] : (e.type === 'TYT' && ['tr', 'mat', 'fen', 'sos'].includes(k) ? e[k] : undefined);
      if (typeof v === 'number') nets[NET_LABEL[k]] = v;
    });
    return { ad: String(e.name || '').trim(), tarih: e.date, tur: e.type, toplamNet: num(e.total), netler: nets, sira: e.yayinSira ? `${e.yayinSira}/${e.yayinKatilim || '?'}` : null };
  };
  const exams = arr(raw.exams).filter(e => e.date).sort((a, b) => b.date.localeCompare(a.date) || num(b.id) - num(a.id));
  const tyts = exams.filter(e => e.type === 'TYT'), ayts = exams.filter(e => e.type === 'AYT' || e.type === 'SAY');
  const bestT = tyts.reduce((m, e) => !m || num(e.total) > num(m.total) ? e : m, null);
  const avg = (l, n) => l.length ? r2(l.slice(0, n).reduce((t, e) => t + num(e.total), 0) / Math.min(n, l.length)) : null;

  /* çalışmalar */
  const acts = arr(raw.activities);
  const dayQ = {}, dayMin = {};
  acts.forEach(a => { dayQ[a.date] = (dayQ[a.date] || 0) + num(a.questions); dayMin[a.date] = (dayMin[a.date] || 0) + num(a.duration); });
  const goal = num(st.dailyGoal) || 100;
  let wq = 0, wmin = 0, wdays = 0;
  for (let i = 0; i < 7; i++) { const d = addDays(today, -i); wq += dayQ[d] || 0; wmin += dayMin[d] || 0; if (dayQ[d] || dayMin[d]) wdays++; }
  const lastActive = acts.reduce((m, a) => a.date > m ? a.date : m, '');
  const todayActs = acts.filter(a => a.date === today);

  /* seri: computeStreak() ile aynı kural */
  const active = new Set(acts.map(a => a.date)), off = raw.offDays || {}, shield = raw.shieldDays || {};
  let streak = 0, cur = today;
  for (let i = 0; i < 3650; i++) {
    if (active.has(cur)) streak++;
    else if (off[cur] === 'Pas/Off' || shield[cur]) { /* atla */ }
    else if (i !== 0) break;
    cur = addDays(cur, -1);
  }

  /* zayıf noktalar: computeWeakSpotsRaw() (kitap testleri hariç) */
  const since = addDays(today, -29), weak = [];
  const bySubj = {}, byTopic = {};
  acts.filter(a => (a.date || '') >= since && num(a.correct) + num(a.wrong) > 0).forEach(a => {
    const ex = a.examType === 'TYT' ? 'TYT' : 'AYT', k = ex + '|' + a.subject;
    (bySubj[k] = bySubj[k] || { c: 0, w: 0 }); bySubj[k].c += num(a.correct); bySubj[k].w += num(a.wrong);
    const topic = String(a.topic || '').trim();
    if (topic && !GENERIC_TOPICS.includes(topic)) { const tk = k + '|' + topic; (byTopic[tk] = byTopic[tk] || { c: 0, w: 0 }); byTopic[tk].c += num(a.correct); byTopic[tk].w += num(a.wrong); }
  });
  const acc = (c, w) => (c + w) > 0 ? Math.round(c / (c + w) * 100) : null;
  const short = s => String(s || '').replace(/^(TYT|AYT)\s+/, '');
  Object.entries(bySubj).forEach(([k, v]) => { const a = acc(v.c, v.w); if (v.c + v.w >= 15 && a < 65) { const [ex, sub] = k.split('|'); weak.push({ tur: 'Ders', kaynak: 'Çalışma', ad: `${ex} ${short(sub)}`, dogruluk: a, cevap: v.c + v.w }); } });
  Object.entries(byTopic).forEach(([k, v]) => { const a = acc(v.c, v.w); if (v.c + v.w >= 8 && a < 65) { const [ex, sub, ...t] = k.split('|'); weak.push({ tur: 'Konu', kaynak: 'Çalışma', ad: t.join('|'), ders: `${ex} ${short(sub)}`, dogruluk: a, cevap: v.c + v.w }); } });
  ['TYT', 'AYT', 'SAY'].forEach(type => {
    const recent = exams.filter(e => e.type === type && e.answers).slice(0, 5);
    if (!recent.length) return;
    EXAM_LEAVES[type].forEach(([key, label]) => {
      let c = 0, w = 0; recent.forEach(e => { const a = e.answers[key]; if (a) { c += num(a.d); w += num(a.y); } });
      const a = acc(c, w);
      if (c + w >= 10 && a < 65) weak.push({ tur: 'Ders', kaynak: 'Deneme', ad: `${type} ${label}`, ders: `son ${recent.length} deneme`, dogruluk: a, cevap: c + w });
    });
  });
  weak.sort((a, b) => a.dogruluk - b.dogruluk);

  /* bugünkü plan */
  const plan = arr(raw.planBlocks);
  const block = b => ({ saat: b.time || '', ders: b.subject || '', konu: b.topic || '', sure: num(b.duration), hedefSoru: num(b.targetQuestions) || null, not: b.note || '', bitti: !!b.completed });
  const todayPlan = plan.filter(b => b.date === today).sort((a, b) => String(a.time).localeCompare(String(b.time))).map(block);
  const futureDays = [...new Set(plan.filter(b => b.date > today).map(b => b.date))].sort();
  const nextPlanDay = futureDays[0] ? { tarih: futureDays[0], blok: plan.filter(b => b.date === futureDays[0]).length } : null;
  const lastPlanDay = [...new Set(plan.filter(b => b.date < today).map(b => b.date))].sort().pop() || null;

  const cards = arr(raw.flashcards);
  const curr = raw.curriculum || {};
  let learned = 0, missing = 0;
  Object.values(curr).forEach(t => Object.values(t || {}).forEach(v => { if (v === 'ogrenildi') learned++; else if (v === 'eksik') missing++; }));
  const examDate = st.examDate || '';

  return {
    sinavTarihi: examDate || null,
    sinavaGun: examDate ? dayDiff(today, examDate) : null,
    hedefNet: { TYT: num(st.targetTyt) || null, AYT: num(st.targetAyt) || null },
    alan: st.alan || null,
    sonTYT: examOut(tyts[0]),
    oncekiTYT: examOut(tyts[1]),
    sonAYT: examOut(ayts[0]),
    enIyiTYT: bestT ? { ad: String(bestT.name || '').trim(), tarih: bestT.date, toplamNet: num(bestT.total) } : null,
    son3TYTOrt: avg(tyts, 3),
    denemeSayisi: { TYT: tyts.length, AYT: ayts.length },
    sonDenemeler: exams.slice(0, 6).map(e => ({ ad: String(e.name || '').trim(), tarih: e.date, tur: e.type, toplamNet: num(e.total) })),
    gunlukSoruHedefi: goal,
    gunlukSaatHedefi: num(st.dailyHoursGoal) || null,
    bugun: { soru: dayQ[today] || 0, dakika: dayMin[today] || 0, kayit: todayActs.length },
    son7Gun: { soru: wq, dakika: wmin, aktifGun: wdays },
    sonCalismaGunu: lastActive || null,
    seri: streak,
    zayif: weak.slice(0, 6),
    bugunPlan: todayPlan,
    sonrakiPlanGunu: nextPlanDay,
    sonPlanGunu: lastPlanDay,
    tekrarKarti: { bugunVadeli: cards.filter(c => c.due && c.due <= today).length, toplam: cards.length },
    yanlisDefteri: { bakilmamis: arr(raw.wrongNotes).filter(n => !n.reviewed).length, toplam: arr(raw.wrongNotes).length },
    odevler: arr(raw.homework).filter(h => !h.done).map(h => ({ ders: h.ders, is: h.text, teslim: h.due || null })),
    yaklasanDenemeler: arr(raw.denemeTakvimi).filter(d => d.date >= today).sort((a, b) => a.date.localeCompare(b.date)).map(d => ({ ad: d.name, tarih: d.date, kurum: d.kurum || '' })),
    mufredat: { ogrenildi: learned, eksik: missing }
  };
}

/* =====================================================================
   2) DEUTSCHFLOW  (alan anlamları DeutschFlow/index.html'den)
   ===================================================================== */
const DE_KEYS = ['stats', 'lastDay', 'streak', 'shields', 'streakBest', 'xp', 'done', 'days', 'ytWatched', 'cards', 'wrong', 'skill', 'updatedAt'];
/* A1-A2 kursu: YT_UNITS v01–v78 (Erhan Özdemir "Almanca Kolay" sırası) */
const LESSONS = [["v01","Selamlaşma, Vedalaşma, Tanışma"],["v02","Basit Soru Kalıpları"],["v03","Sayılar ve Yıllar"],["v04","„Nasılsın?“ Soruları ve Cevapları"],["v05","Alfabe ve Harf Grupları"],["v06","Artikeller: der, die, das"],["v07","ein / eine / kein / keine (1): „Was ist das?“"],["v08","ein / eine / kein / keine (2): Soru ve Cevaplar"],["v09","Saat Sorma ve Saati Söyleme"],["v10","Düzenli ve Düzensiz Fiiller"],["v11","Düzensiz Fiiller: essen, lesen"],["v12","Ayrılabilen Fiiller"],["v13","Günler: Wann?, Bis wann?, Von wann bis wann?"],["v14","Meslekler"],["v15","Akkusativ: İsmin -i Hâli"],["v16","„müssen“: Zorunda Olmak"],["v17","„können“: Yapabilmek"],["v18","„möchten“: İstemek (kibar)"],["v19","„sollen“ (-meli) ve „mögen“ (sevmek)"],["v20","„wollen“ (istemek) ve „dürfen“ (izni olmak)"],["v21","Aylar, Sıra Sayıları, Doğum Günü"],["v22","Ülkeler ve Uyruklar"],["v23","Ülkeler ve Diller"],["v24","Yol Tarif Etmek"],["v25","Perfekt (-di’li Geçmiş) 1: haben ile"],["v26","Perfekt 2: sein ile ve düzensiz fiiller"],["v27","İyelik: mein, dein, sein…"],["v28","Aile ve Aile Üyeleri, „heißen“"],["v29","Dativ: „Wo?“ ve „Wem?“"],["v30","Yer Edatları: Dativ mi Akkusativ mi?"],["v31","Yönelim Edatları 1: in, durch, über"],["v32","Yönelim Edatları 2: zu, an … vorbei"],["v33","Şahıs Zamirleri: Dativ (bana, sana…)"],["v34","Emir Cümleleri (Imperativ)"],["v35","Vücudumuz ve Hastalıklar"],["v36","Hava Durumu ve Yönler"],["v37","Karşılaştırma: Komparativ ve Superlativ"],["v38","Renkler"],["v39","Ambalajlar, Birimler ve Fiyatlar"],["v40","Evimiz: Odalar ve Mobilyalar"],["v41","Hobiler, „treffen“ ve „fahren“"],["v42","Sıklık Zarfları: nie, manchmal, oft, immer"],["v43","Markette ve Mağazada Alışveriş"],["v44","Yiyecekler"],["v45","Görülmesi Gereken Yerler"],["v46","İyelik Artikelleri: Nominativ, Akkusativ, Dativ"],["v47","Meyveler"],["v48","Sıfat Çekimi: Belirli Artikel ile"],["v49","Zaman Zarfları"],["v50","Sıfat Çekimi: Belirsiz Artikel ile"],["v51","Zaman Edatları: zwischen, von … bis, von … an"],["v52","Edilgen Çatı (Passiv Präsens)"],["v53","Dönüşlü Fiiller (sich + fiil)"],["v54","„dass“ Bağlacı: -dığını"],["v55","„wenn“ Bağlacı: -ırsa, -dığında"],["v56","„als“ Bağlacı: Geçmişte -iken"],["v57","Dolaylı Sorular: „ob“ (-ip -mediğini)"],["v58","Konjunktiv II: „würde“ ile kibarlık ve dilek"],["v59","Dolaylı W-Soruları"],["v60","Restoranda: Sipariş ve Hesap"],["v61","Hangi? (welch-) ve Bu (dieser)"],["v62","„lassen“: Bırakmak, Yaptırmak"],["v63","Giyim Mağazasında Diyalog"],["v64","Ayakkabı Mağazasında Diyalog"],["v65","Diyalog: „Das ist sehr nett!“"],["v66","Özgeçmiş (CV) Hazırlama"],["v67","Diyalog: Perfekt ile Hafta Sonu"],["v68","Bağlaçlar: bis, seit, seitdem"],["v69","Otelde Diyalog 1: Giriş"],["v70","Otelde Diyalog 2: Sorunlar ve Çıkış"],["v71","Soru Kelimeleri: Hangisi Uygun?"],["v72","Diyalog: „Uzun zamandır mı bekliyorsun?“"],["v73","Geçmiş Zaman: war ve hatte"],["v74","Diyalog: „Telefonlarımızın şarjı bitti“"],["v75","Modal Fiiller: Tabelalar Ne Diyor?"],["v76","Diyalog: „Sorununuz mu var?“"],["v77","Diyalog: „Birlikte çalışalım mı?“"],["v78","Diyalog: Buluşma Ayarlamak"]];
const LESSON_T = Object.fromEntries(LESSONS);
const SKILL_TR = { horen: 'Dinleme', lesen: 'Okuma', schreiben: 'Yazma', sprechen: 'Konuşma' };

async function loadDE() {
  const vals = await Promise.all(DE_KEYS.map(k => getJSON(`${DE_DB}/${k}.json`)));
  const raw = {}; DE_KEYS.forEach((k, i) => raw[k] = vals[i]);
  if (vals.every(v => v == null)) throw new Error('profil verisi boş');
  return deriveDE(raw);
}

function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
function lessonName(id) {
  if (LESSON_T[id]) return `${id} · ${LESSON_T[id]}`;
  if (/^vk\d+$/.test(id)) return `Karma Test ${id.slice(2)}`;
  return id;
}

function deriveDE(raw, now = new Date()) {
  const today = ymd(now), t = now.getTime();
  /* displayStreak() */
  let streak = 0;
  if (raw.lastDay) { const g = dayDiff(raw.lastDay, today); streak = (g <= 1 || num(raw.shields) >= g - 1) ? num(raw.streak) : 0; }
  const cards = arr(raw.cards), done = raw.done || {}, days = raw.days || {};
  const due = cards.filter(c => num(c.due) <= t);
  const doneV = LESSONS.filter(([id]) => done[id] != null);
  const nextL = LESSONS.find(([id]) => done[id] == null);
  const watched = Object.keys(raw.ytWatched || {}).filter(k => /^v\d+$/.test(k));
  let w = { ders: 0, dakika: 0, cevap: 0, dogru: 0, xp: 0, aktifGun: 0 };
  for (let i = 0; i < 7; i++) { const d = days[addDays(today, -i)]; if (d) { w.ders += num(d.lessons); w.dakika += num(d.min); w.cevap += num(d.answers); w.dogru += num(d.correct); w.xp += num(d.xp); w.aktifGun++; } }
  const td = days[today] || null;
  const weakLessons = Object.entries(done).filter(([id, v]) => typeof v === 'number' && v < 0.85 && (LESSON_T[id] || /^vk/.test(id)))
    .sort((a, b) => a[1] - b[1]).slice(0, 4).map(([id, v]) => ({ ders: lessonName(id), puan: Math.round(v * 100) }));
  const wrongBy = {};
  arr(raw.wrong).forEach(x => { const u = x.item && x.item.unit; if (u) wrongBy[u] = (wrongBy[u] || 0) + 1; });
  const wrongTop = Object.entries(wrongBy).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([u, n]) => ({ ders: lessonName(u), yanlis: n }));
  const skills = {};
  Object.entries(raw.skill || {}).forEach(([k, l]) => { const a = arr(l).slice(-24); if (a.length) skills[SKILL_TR[k] || k] = { ortalama: Math.round(a.reduce((s, x) => s + num(x.v), 0) / a.length * 100), adet: a.length }; });
  const pool = (due.length ? due : cards).filter(c => c.de && c.tr);
  const wc = pool.length ? pool[hashStr(today) % pool.length] : null;
  const st = raw.stats || {};
  /* çalışma modu için kart listesi (rxSiriPayload ile aynı mantık: önce vadesi gelenler, sonra en yakın vadeliler) */
  const byDue = cards.filter(c => c.id && c.de && c.tr).sort((a, b) => num(a.due) - num(b.due));
  let drill = byDue.filter(c => num(c.due) <= t).slice(0, 60);
  if (drill.length < 25) drill = drill.concat(byDue.filter(c => !drill.includes(c)).slice(0, 25 - drill.length));
  return {
    _drill: drill.map(c => ({ id: String(c.id), de: String(c.de), tr: String(c.tr), ctx: c.ctx || undefined, ctxTr: c.ctxTr || undefined, due: num(c.due) <= t })),
    seri: streak, enIyiSeri: num(raw.streakBest), sonCalisma: raw.lastDay || null, xp: num(raw.xp),
    kartlar: { bugunTekrar: due.length, toplam: cards.length, ustalasilan: cards.filter(c => num(c.box) >= 5).length },
    kurs: {
      ad: 'A1-A2 (78 ders)', biten: doneV.length, toplam: LESSONS.length,
      sonBiten: doneV.length ? lessonName(doneV[doneV.length - 1][0]) : null,
      siradaki: nextL ? lessonName(nextL[0]) : null,
      izlenenVideo: watched.length,
      karmaTest: Object.keys(done).filter(k => /^vk\d+$/.test(k)).length
    },
    bugun: td ? { ders: num(td.lessons), dakika: num(td.min), cevap: num(td.answers), dogru: num(td.correct), xp: num(td.xp) } : { ders: 0, dakika: 0, cevap: 0, dogru: 0, xp: 0 },
    son7Gun: w,
    genelDogruluk: num(st.answers) ? Math.round(num(st.correct) / num(st.answers) * 100) : null,
    toplam: { ders: num(st.lessons), cevap: num(st.answers), tekrar: num(st.reviews), telaffuzDenemesi: num(st.pron) },
    zayifDersler: weakLessons,
    enCokYanlis: wrongTop,
    beceriler: skills,
    gununKelimesi: wc ? { de: wc.de, tr: wc.tr, ornek: wc.ctx || null, ornekTr: wc.ctxTr || null } : null
  };
}

/* =====================================================================
   3) CÜZDAN  (Firestore, yalnızca getDoc; veri modeli Cuzdan/index.html'den)
   ===================================================================== */
const CZ_BASE_CATS = { market: 'Market', food: 'Restoran & Kafe', transport: 'Ulaşım', fuel: 'Akaryakıt', electronics: 'Elektronik', clothing: 'Giyim', subscription: 'Abonelik', bills: 'Faturalar', rent: 'Kira', fun: 'Eğlence', health: 'Sağlık', education: 'Eğitim', fees: 'Faiz & Ücret', other: 'Diğer', income: 'Gelir', gift: 'Harçlık / Hediye', salary: 'Maaş' };
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

const CzFirebase = {
  sdk: null,
  async init() {
    if (this.sdk) return;
    const b = `https://www.gstatic.com/firebasejs/${FB_VER}/`;
    const [A, Au, Fs] = await Promise.all([import(b + 'firebase-app.js'), import(b + 'firebase-auth.js'), import(b + 'firebase-firestore.js')]);
    /* ayrı uygulama adı: Cüzdan'ın kendi oturumuna dokunmaz */
    const app = A.getApps().find(a => a.name === 'kontrolmerkezi') || A.initializeApp(CZ_CFG, 'kontrolmerkezi');
    const auth = Au.getAuth(app);
    try { await Au.setPersistence(auth, Au.browserLocalPersistence); } catch (e) {}
    this.sdk = { Au, Fs, auth, db: Fs.getFirestore(app) };
  },
  waitUser() { const { Au, auth } = this.sdk; return new Promise(res => { const off = Au.onAuthStateChanged(auth, u => { off(); res(u ? { uid: u.uid, email: u.email } : null); }); }); },
  async signIn(e, p) { const r = await this.sdk.Au.signInWithEmailAndPassword(this.sdk.auth, e, p); return { uid: r.user.uid, email: r.user.email }; },
  signOut() { return this.sdk.Au.signOut(this.sdk.auth); },
  async getDoc(path) { const { Fs, db } = this.sdk; const d = await Fs.getDoc(Fs.doc(db, ...path)); return d.exists() ? d.data() : null; }
};
const czApi = () => window.__czMock || CzFirebase;   // testlerde sahte adaptör

const CZ_ERR = {
  'auth/invalid-credential': 'E-posta ya da şifre yanlış', 'auth/wrong-password': 'E-posta ya da şifre yanlış', 'auth/user-not-found': 'Bu e-postayla hesap yok',
  'auth/invalid-email': 'E-posta adresi geçersiz', 'auth/too-many-requests': 'Çok fazla deneme; biraz bekle', 'auth/network-request-failed': 'İnternet bağlantısı yok',
  'permission-denied': 'Firestore bu veriyi okumaya izin vermedi', 'unavailable': 'Firebase’e ulaşılamıyor'
};
const czHuman = e => CZ_ERR[(e && e.code) || ''] || (e && e.message) || 'Bilinmeyen hata';

async function czConnect(email, password) {
  const api = czApi(); await api.init();
  try { const u = await api.signIn(email, password); LS.setStr('km-cz-email', u.email || email); return u; }
  catch (e) { throw new Error(czHuman(e)); }
}
async function czDisconnect() {
  LS.del('km-cz-email');
  try { const api = czApi(); await api.init(); await api.signOut(); } catch (e) {}
}

async function loadCZ() {
  if (!LS.str('km-cz-email')) return { off: true, why: 'Ayarlar’dan Cüzdan hesabına bağlan' };
  const api = czApi();
  try { await api.init(); } catch (e) { throw new Error('Firebase yüklenemedi'); }
  const u = await api.waitUser();
  if (!u) { LS.del('km-cz-email'); return { off: true, why: 'Oturum kapanmış; yeniden bağlan' }; }
  try {
    const [sum, meta] = await Promise.all([api.getDoc(['users', u.uid, 'summary', 'now']), api.getDoc(['users', u.uid, 'cuzdan', 'meta'])]);
    let full = null, enc = !!(meta && meta.enc);
    if (meta && !enc && num(meta.chunks) > 0) {
      const parts = await Promise.all(Array.from({ length: num(meta.chunks) }, (_, i) => api.getDoc(['users', u.uid, 'cuzdan', 'c' + i])));
      if (parts.every(Boolean)) {
        const d = JSON.parse(parts.map(p => p.d || '').join(''));
        if (d && d.cuzdan === 'enc') enc = true; else full = deriveCZ(d);
      }
    }
    if (!sum && !full) throw new Error('Cüzdan’da özet bulunamadı (Cüzdan’ı bir kez açıp eşitle)');
    return {
      hesap: u.email,
      ozet: sum ? { durum: sum.durum || '', buAy: sum.ay || '', odemeler: sum.odemeler || '', yazildi: sum.at ? new Date(sum.at).toISOString() : null } : null,
      sifreli: enc,
      ayrinti: full
    };
  } catch (e) { throw new Error(czHuman(e)); }
}

function deriveCZ(s, now = new Date()) {
  s = { accounts: [], transactions: [], budgets: [], categories: [], ...s };
  const T = ymd(now), y = now.getFullYear(), m = now.getMonth();
  const dim = (y, m) => new Date(y, m + 1, 0).getDate();
  const iso = d => ymd(d);
  const addMonths = (str, k) => { const [yy, mm, dd] = str.split('-').map(Number); const t = new Date(yy, mm - 1 + k, 1); return iso(new Date(t.getFullYear(), t.getMonth(), Math.min(dd, dim(t.getFullYear(), t.getMonth())))); };
  const split = (total, n) => { const base = Math.floor(total / n * 100) / 100, out = Array(n).fill(base); out[0] = r2(total - base * (n - 1)); return out; };
  const catName = id => ((s.categories || []).find(c => c.id === id) || {}).name || CZ_BASE_CATS[id] || 'Diğer';
  const txById = Object.fromEntries(s.transactions.map(t => [t.id, t]));
  /* D.allocations: taksitler her aya kendi payıyla */
  const alloc = [];
  s.transactions.forEach(t => {
    if (t.kind === 'expense') { const n = Math.max(1, t.installments | 0); split(num(t.amount), n).forEach((amount, k) => alloc.push({ amount, category: t.category, date: addMonths(t.date, k) })); }
    else if (t.kind === 'refund') { const o = t.refOf && txById[t.refOf]; alloc.push({ amount: -num(t.amount), category: (o && o.category) || t.category || 'other', date: t.date }); }
  });
  const spendIn = (a, b) => alloc.filter(x => x.date >= a && x.date <= b);
  const sumBy = l => { const o = {}; l.forEach(x => o[x.category] = (o[x.category] || 0) + x.amount); return o; };
  const tot = l => r2(l.reduce((t, x) => t + x.amount, 0));
  const curFrom = iso(new Date(y, m, 1)), day = now.getDate();
  const lf = new Date(y, m - 1, 1), prevFrom = iso(lf), prevTo = iso(new Date(lf.getFullYear(), lf.getMonth(), Math.min(day, dim(lf.getFullYear(), lf.getMonth()))));
  const cur = spendIn(curFrom, T), prev = spendIn(prevFrom, prevTo), curBy = sumBy(cur);
  const prevFull = tot(spendIn(prevFrom, iso(new Date(lf.getFullYear(), lf.getMonth() + 1, 0))));
  const days = dim(y, m);
  const budgets = (s.budgets || []).map(b => { const spent = r2(curBy[b.category] || 0), lim = num(b.limit); return { kategori: catName(b.category), limit: lim, harcanan: spent, kalan: r2(lim - spent), yuzde: lim ? Math.round(spent / lim * 100) : null, asildi: spent >= lim, ayaSonuTahmin: r2(spent / day * days) }; });
  /* D.balance: kredi kartı dışı hesaplar */
  const effect = (t, id) => {
    let v = 0;
    if (t.accountId === id) { switch (t.kind) { case 'income': case 'refund': v += num(t.amount); break; case 'goal': v += t.dir === 'out' ? num(t.amount) : -num(t.amount); break; case 'debt': v += t.dir === 'in' ? num(t.amount) : -num(t.amount); break; default: v -= num(t.amount); } }
    if (t.toAccountId === id && t.kind === 'transfer') v += num(t.toAmount ?? t.amount);
    return v;
  };
  const accounts = s.accounts.filter(a => !a.archived && a.type !== 'credit').map(a => ({ ad: a.name, tur: a.type, paraBirimi: a.currency || 'TRY', bakiye: r2(s.transactions.reduce((b, t) => b + effect(t, a.id), num(a.opening))) }));
  const cards = s.accounts.filter(a => !a.archived && a.type === 'credit').map(a => ({ ad: a.name, limit: num(a.credit && a.credit.limit) || null, kesimGunu: a.credit && a.credit.cutDay, sonOdemeGunu: a.credit && a.credit.dueDay }));
  const acctName = id => (s.accounts.find(a => a.id === id) || {}).name || '';
  const recent = s.transactions.filter(t => t.kind === 'expense').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6)
    .map(t => ({ tarih: t.date, ne: t.merchant || t.note || catName(t.category), tutar: num(t.amount), kategori: catName(t.category), hesap: acctName(t.accountId), taksit: (t.installments | 0) > 1 ? t.installments : undefined }));
  const income = s.transactions.filter(t => t.kind === 'income' && t.date >= curFrom && t.date <= T).reduce((a, t) => a + num(t.amount), 0);
  return {
    ay: MONTHS[m],
    buAyHarcama: tot(cur),
    gecenAyAyniDonem: tot(prev),
    gecenAyToplam: prevFull,
    degisimYuzde: tot(prev) > 0 ? Math.round((tot(cur) - tot(prev)) / tot(prev) * 100) : null,
    buAyGelir: r2(income),
    son7GunHarcama: tot(spendIn(addDays(T, -6), T)),
    kategoriler: Object.entries(curBy).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ kategori: catName(k), tutar: r2(v) })),
    butceler: budgets,
    hesaplar: accounts,
    kartlar: cards,
    sonHarcamalar: recent,
    duzenliOdemeSayisi: (s.recurring || []).length
  };
}

/* =====================================================================
   4) KRİPTOBOT  (CSV sütunları bot/src/bot.js + shadows.js exportCsv'den)
   ===================================================================== */
const STRATS = [['main', 'Ana strateji'], ['4h-spot', '4s spot'], ['trend-1d', 'Günlük trend'], ['sik-1h', 'Sık işlem']];

function parseBotLink(s) {
  try {
    const u = new URL(String(s || '').trim());
    const token = u.searchParams.get('token');
    if (!token || !/^https?:$/.test(u.protocol)) return null;
    return { base: u.origin, token };
  } catch (e) { return null; }
}
function parseCSV(t) {
  t = String(t || '').replace(/^﻿/, '');
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const h = rows.shift() || [];
  return rows.filter(r => r.length > 1 || r[0]).map(r => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])));
}
async function botCSV(link, params) {
  const u = new URL('/export.csv', link.base);
  u.searchParams.set('token', link.token);
  Object.entries(params).forEach(([k, v]) => v && u.searchParams.set(k, v));
  let r;
  try { r = await fetch(u.toString(), { cache: 'no-store' }); }
  catch (e) { throw new Error(navigator.onLine === false ? 'internet yok' : 'bağlantı kurulamadı: bot tarayıcıdan okumaya izin vermiyor (CORS başlığı yok)'); }
  if (r.status === 403) throw new Error('bağlantı anahtarı (token) geçersiz');
  if (!r.ok) throw new Error('bot HTTP ' + r.status);
  return parseCSV(await r.text());
}
const fnum = v => v === '' || v == null || !isFinite(+v) ? null : +v;
const pair = s => String(s || '').replace(/USDT$/, '') + '/USDT';
const SIG_TR = { open: 'açık pozisyon', order: 'emir bekliyor', pending: 'onay bekliyor', closed: 'kapandı', cancelled: 'iptal', blocked: 'engellendi', rejected: 'reddedildi', timeout: 'zaman aşımı', skipped: 'atlandı' };

function deriveStrat(id, label, sigRows, evRows, now = Date.now()) {
  const sigs = sigRows.map(r => ({ parite: pair(r.sembol), zaman: r.sinyal_mumu_utc || '', t: Date.parse(r.sinyal_mumu_utc) || 0, durum: SIG_TR[r.durum] || r.durum, ham: r.durum, puan: fnum(r.puan), karar: r.karar || undefined, giris: fnum(r.giris), stop: fnum(r.stop), hedef: fnum(r.hedef), cikis: fnum(r.cikis), cikisNedeni: r.cikis_nedeni || undefined, pnlUSDT: fnum(r.pnl_usdt), R: fnum(r.R), engel: r.engel_nedeni || undefined }))
    .sort((a, b) => b.t - a.t);
  const evs = evRows.map(r => { let d = null; try { d = JSON.parse(r.detay); } catch (e) {} return { t: Date.parse(r.zaman_utc) || 0, tur: r.tur, sembol: r.sembol, d }; }).sort((a, b) => a.t - b.t);
  const closes = evs.filter(e => e.tur === 'close');
  const lastEq = [...closes].reverse().find(e => e.d && typeof e.d.equityU === 'number');
  const wk = closes.filter(e => e.t >= now - 7 * 864e5);
  const closed = sigs.filter(s => s.pnlUSDT != null && s.ham === 'closed');
  const clean = s => { const o = { ...s }; delete o.t; delete o.ham; return o; };
  return {
    id, ad: label,
    bakiyeUSDT: lastEq ? r2(lastEq.d.equityU) : null,
    acikPozisyon: sigs.filter(s => s.ham === 'open').map(clean),
    bekleyenEmir: sigs.filter(s => s.ham === 'order' || s.ham === 'pending').map(clean),
    sonSinyaller: sigs.slice(0, 3).map(clean),
    sinyalSayisi: sigs.length,
    kapananIslem: closed.length, kazanan: closed.filter(s => s.pnlUSDT > 0).length,
    toplamPnlUSDT: r2(closed.reduce((a, s) => a + s.pnlUSDT, 0)),
    buHafta: { islem: wk.length, kazanan: wk.filter(e => num(e.d && e.d.pnlU) > 0).length, pnlUSDT: r2(wk.reduce((a, e) => a + num(e.d && e.d.pnlU), 0)) },
    sonOlay: evs.length ? { zaman: new Date(evs[evs.length - 1].t).toISOString(), tur: evs[evs.length - 1].tur } : null
  };
}

async function loadBot() {
  const link = parseBotLink(LS.str('km-bot-link'));
  if (!link) return { off: true, why: 'Ayarlar’a botun “Kayıt dosyası” linkini yapıştır' };
  const out = await Promise.all(STRATS.map(async ([id, label]) => {
    const p = id === 'main' ? {} : { strateji: id };
    const [sig, ev] = await Promise.all([botCSV(link, { ...p, tablo: 'sinyaller' }), botCSV(link, { ...p, tablo: 'olaylar' })]);
    return deriveStrat(id, label, sig, ev);
  }));
  return { mod: 'kağıt işlem (sanal para)', stratejiler: out };
}

/* =====================================================================
   Durum yöneticisi + önbellek
   ===================================================================== */
const SOURCES = { yks: ['YKS Takip', loadYKS], de: ['DeutschFlow', loadDE], cz: ['Cüzdan', loadCZ], bot: ['KriptoBot', loadBot] };
const CACHE_KEY = 'km-cache-v1';
const listeners = new Set();
const state = {};
(() => {
  const c = LS.get(CACHE_KEY, {});
  Object.keys(SOURCES).forEach(k => {
    const e = c[k];
    state[k] = e && e.data ? { status: 'cached', at: e.at, data: e.data, err: '' } : { status: 'idle', at: 0, data: null, err: '' };
  });
})();
const emit = () => listeners.forEach(f => { try { f(state); } catch (e) { console.warn(e); } });
const saveCache = () => { const c = {}; Object.entries(state).forEach(([k, v]) => { if (v.data) c[k] = { at: v.at, data: v.data }; }); LS.set(CACHE_KEY, c); };
let inflight = null;

async function refreshOne(k) {
  const s = state[k];
  s.status = 'loading'; s.err = ''; emit();
  try {
    const d = await SOURCES[k][1]();
    if (d && d.off) { s.status = 'off'; s.err = d.why || ''; s.data = null; s.at = 0; }
    else { s.status = 'ok'; s.data = d; s.at = Date.now(); }
  } catch (e) {
    s.status = 'err'; s.err = (e && e.message) || String(e);
    console.warn('[veri]', k, e);
  }
  saveCache(); emit();
}
function refresh(which) {
  const ks = which ? [].concat(which) : Object.keys(SOURCES);
  if (!which && inflight) return inflight;
  const p = Promise.all(ks.map(refreshOne)).then(() => state);
  if (!which) { inflight = p; p.finally(() => { inflight = null; }); }
  return p;
}
/* Gemini'ye giden kısa bağlam */
function context() {
  const now = new Date(), o = { simdi: `${ymd(now)} ${hhmm(now)}`, gun: now.toLocaleDateString('tr-TR', { weekday: 'long' }) };
  Object.entries(SOURCES).forEach(([k, [name]]) => {
    let s = state[k];
    const e = { uygulama: name };
    if (s.data) s = { ...s, data: Object.fromEntries(Object.entries(s.data).filter(([k]) => k[0] !== '_')) };
    if (s.data) { e['veri güncel'] = hhmm(s.at) + (ymd(new Date(s.at)) !== ymd(now) ? ` (${ymd(new Date(s.at))})` : ''); e.durum = s.status === 'ok' ? 'güncel' : s.status === 'err' ? 'yenilenemedi, önbellekteki son veri: ' + s.err : 'önbellekten'; e.veri = s.data; }
    else e.durum = s.status === 'off' ? 'bağlı değil: ' + s.err : s.status === 'err' ? 'hata: ' + s.err : 'henüz yüklenmedi';
    o[k] = e;
  });
  return o;
}

/* =====================================================================
   TEK YAZMA NOKTASI: DeutschFlow'un mevcut Siri sonuç kutusu
   POST deutschflow/siriResults/<profil>.json  {at, results:[{id, ok}]}
   (DeutschFlow rxSiriPull() bunu okuyup kartlara işler ve kutuyu boşaltır.)
   Başka hiçbir yere yazılmaz; deutschflow/siri ve data'ya dokunulmaz.
   ===================================================================== */
const DE_RESULTS_URL = 'https://deutschflow-f8eed-default-rtdb.europe-west1.firebasedatabase.app/deutschflow/siriResults/' + DE_PROFILE + '.json';
const PENDING_KEY = 'km-de-pending';
async function postResults(pack) {
  const r = await fetch(DE_RESULTS_URL, { method: 'POST', body: JSON.stringify(pack) });   // text/plain: CORS ön-isteği yok
  if (!r.ok) throw new Error('HTTP ' + r.status);
}
async function deSendResults(results) {
  const clean = (results || []).filter(x => x && x.id).map(x => ({ id: String(x.id), ok: x.ok === true }));
  const pending = LS.get(PENDING_KEY, []);
  if (clean.length) pending.push({ at: Date.now(), results: clean });
  if (!pending.length) return { sent: 0 };
  const left = [];
  let sent = 0;
  for (const p of pending) { try { await postResults(p); sent += p.results.length; } catch (e) { left.push(p); } }
  LS.set(PENDING_KEY, left);
  if (left.length) { const e = new Error('gönderilemedi'); e.queued = left.reduce((a, p) => a + p.results.length, 0); throw e; }
  return { sent };
}

window.KMData = {
  state, refresh, context, on(f) { listeners.add(f); return () => listeners.delete(f); },
  name: k => SOURCES[k][0], keys: Object.keys(SOURCES),
  deSendResults, deFlushPending: () => LS.get(PENDING_KEY, []).length ? deSendResults([]).catch(() => {}) : null,
  czConnect, czDisconnect, czEmail: () => LS.str('km-cz-email'),
  parseBotLink, setBotLink(v) { LS.setStr('km-bot-link', v || ''); }, botLink: () => LS.str('km-bot-link'),
  _derive: { deriveYKS, deriveDE, deriveCZ, deriveStrat, parseCSV },
  util: { ymd, addDays, dayDiff, hhmm, MONTHS, LS }
};
})();

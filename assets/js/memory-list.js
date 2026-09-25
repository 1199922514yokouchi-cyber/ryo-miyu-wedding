/* ==========================================================
   MEMORY 下層ページ（memory-list.html）のロジック。

   ▼本人の構想（そのまま実装の順序になっている）
   「もっと思い出を振り返る」ボタンを押す → トップページの写真が流れる
   空間に入り込む（ズームイン）→ 写真が空間に散らばってる → 整理タブ
   ボタンを押すとそのカテゴリーの写真が中央に一枚ずつカルーセルで
   表示される（実際に整理される演出）→ 整理されてる画面でもタブで
   カテゴリーを切り替えられる → 枠外かバツボタンで空間に戻る →
   MEMORYに戻るボタンでズームアウトしてトップページへ。

   ▼しくみ（参考：Codrops「Infinite GSAP Scroll Gallery」（奥行きの
   ある散らばった写真がクリックでFlip遷移する）、「Scattered Polaroids
   Gallery」（散らばった写真が中央に集まる）、GSAP Flipの考え方）
   - 全182枚の写真要素を1つの空間に置き、位置・大きさ・傾き・不透明度を
     「空間にいる時の姿勢（spacePose）」と「カルーセルに整理された時の
     姿勢（carouselPose）」の2つから毎フレーム計算して書き込む。
     整理ボタンを押すと、そのカテゴリーの写真だけ0→1の補間値tを
     アニメーションさせ、2つの姿勢の間を動かす＝散らばった位置から
     中央のカルーセルの位置へ実際に飛んできて並ぶ（GSAP Flipの
     「最初の位置と最後の位置を測って、その間を補間する」と同じ考え方を、
     ライブラリなしで両方の位置をJSで直接計算して実現している）。
   - 空間は縦横とも「画面外に出た写真が反対側へ回り込む」無限の空間
     （メッセージ一覧のカルーセルと同じwrapの考え方を2次元にしたもの）。
     どちらへドラッグしても写真が途切れない。写真ごとの奥行き（depth）で
     動く速さ・大きさ・明るさを変え、トップページMEMORYと同じ
     パララックスの奥行き感を出している。何も操作していない間は
     空間がゆっくり漂う（写真の上にマウスがある間は止まる）。
   - カルーセル（整理モード）はメッセージ一覧の読む帯と同じ操作系：
     ドラッグ／スワイプ（離した勢いで吸着）、縦ホイールで1枚ずつ、
     横ホイール・トラックパッドは連続、←→キー、脇の写真をクリック。
     カテゴリー内でも最後→最初へ継ぎ目なくループする。
   - 画像は空間では長辺560pxの小さい版（-s.webp）を使い、カルーセルで
     中央とその両隣に来た写真だけ長辺1600pxの大きい版（-l.webp）を
     読み込んで差し替える（全部を最初から大きい版で読むと約46MBになるため）。
=========================================================== */
(() => {
  const RAW = window.MEMORY_LIST_PHOTOS || [];
  // 動画（movie_1〜11）。写真と全く同じ空間／カルーセルの仕組みに
  // 「type:'video'の写真」として混ぜ込む方式で乗せる（詳しくは
  // memory-list-data.js側のコメントと、このファイル内の型分岐箇所参照）。
  const RAW_VIDEOS = window.MEMORY_LIST_VIDEOS || [];
  const CATS = [
    { key: 'cool', label: 'かっこよくて、かわいい2人' },
    { key: 'funny', label: 'ユーモア' },
    { key: 'memories', label: 'みんなの思い出' },
  ];
  const catLabel = {};
  CATS.forEach((c) => { catLabel[c.key] = c.label; });

  const world = document.getElementById('memWorld');
  const space = document.getElementById('memSpace');
  const dim = document.getElementById('memDim');
  const head = document.getElementById('memHead');
  const counter = document.getElementById('memCounter');
  const closeBtn = document.getElementById('memClose');
  const prevBtn = document.getElementById('memPrev');
  const nextBtn = document.getElementById('memNext');
  const tabsEl = document.getElementById('memTabs');
  const fade = document.getElementById('memFade');
  const backLink = document.getElementById('memBack');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const srcS = (id) => `assets/img/memory-list/mem-${id}-s.webp`;
  const srcL = (id) => `assets/img/memory-list/mem-${id}-l.webp`;
  // 動画のIDを"video-<n>"にしてあるので、上のsrcS/srcLがサムネイル
  // （mem-video-<n>-s/l.webp）にそのまま使い回せる。動画本体だけ別関数。
  const srcV = (id) => `assets/video/memory-list/${id}.mp4`;

  // ---- 小さな道具 ----
  const mod = (a, n) => ((a % n) + n) % n;
  const wrapDelta = (d, n) => mod(d + n / 2, n) - n / 2; // -n/2〜n/2へ折り返す
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  // 決まった種から毎回同じ乱数列を出す（配置がリロードのたびに変わらないように）
  function seeded(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rnd = seeded(20260925);

  // ---- 写真データ（＋動画データを type:'video' として同じ配列に混在） ----
  const photos = RAW.map(([id, cat, ar], i) => ({
    id, cat, ar, i, type: 'photo',
    jx: rnd() - 0.5, jy: rnd() - 0.5,         // マス目の中でのずれ
    depth: 0.72 + rnd() * 0.5,                // 0.72(奥)〜1.22(手前)
    rot: (rnd() - 0.5) * 10,                  // 空間での傾き（±5度）
    t: 0, anim: null,                         // 0=空間, 1=カルーセル
    large: false, loadingLarge: false,
    last: {},                                 // 直前に書き込んだ値（変化した時だけ書く）
  })).concat(RAW_VIDEOS.map(([id, cat, ar], vi) => ({
    id, cat, ar, i: RAW.length + vi, type: 'video',
    jx: rnd() - 0.5, jy: rnd() - 0.5,
    depth: 0.72 + rnd() * 0.5,
    rot: (rnd() - 0.5) * 10,
    t: 0, anim: null,
    large: false, loadingLarge: false,        // 写真用（未使用）
    videoReady: false,                        // 動画本体（mp4）を読み込み済みか
    last: {},
  })));
  const byCat = {};
  CATS.forEach((c) => { byCat[c.key] = photos.filter((p) => p.cat === c.key); });
  photos.forEach((p) => { p.k = byCat[p.cat].indexOf(p); });
  const qByCat = {};
  CATS.forEach((c) => { qByCat[c.key] = 0; });

  // ---- DOM生成 ----
  photos.forEach((p) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = p.type === 'video' ? 'memlist__photo memlist__photo--video' : 'memlist__photo';
    const kind = p.type === 'video' ? '動画' : '写真';
    el.setAttribute('aria-label', `${catLabel[p.cat]}の${kind}（${p.k + 1}枚目）を大きく見る`);
    if (p.type === 'video') {
      // 動画は<video>要素そのものを写真の<img>と同じ枠にはめ込む。
      // 空間や脇に流れている間はposter（サムネイル）が静止画として
      // 表示されるだけで、実際の動画データ（mp4）は読み込まない
      // （preload="none"）。中央に来た時だけsrcVを差し込んで読み込む
      // （ensureVideo参照）。ネイティブのcontrols（再生ボタン等）も
      // 中央に来た時だけ付ける＝空間では写真と同じくクリックで
      // カテゴリーが開くだけの見た目・挙動にする。
      const video = document.createElement('video');
      video.poster = srcS(p.id);
      video.preload = 'none';
      video.playsInline = true;
      video.muted = false;
      // 中央になって操作可能になった時、ドラッグ／クリックの
      // ハンドラ（space側）に操作を奪われないようにする。
      ['pointerdown', 'pointermove', 'pointerup', 'click', 'wheel'].forEach((evt) => {
        video.addEventListener(evt, (e) => { if (el.classList.contains('is-center')) e.stopPropagation(); });
      });
      el.appendChild(video);
      space.appendChild(el);
      p.el = el;
      p.img = video; // 既存コードとの互換のため同じプロパティ名で保持
      p.video = video;
    } else {
      const img = document.createElement('img');
      img.alt = '';
      img.decoding = 'async';
      img.draggable = false;
      img.src = srcS(p.id);
      el.appendChild(img);
      space.appendChild(el);
      p.el = el;
      p.img = img;
    }
  });

  const tabs = CATS.map((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'memlist__tab';
    b.dataset.cat = c.key;
    b.innerHTML = `${c.label}<span class="memlist__tab-count">${byCat[c.key].length}</span>`;
    b.setAttribute('aria-pressed', 'false');
    tabsEl.appendChild(b);
    return b;
  });

  // ---- 寸法（画面サイズから決める。リサイズで測り直す） ----
  const COLS = 14;
  const ROWS = Math.ceil(photos.length / COLS);
  let vw = 0, vh = 0, isSP = false, W = 0, H = 0;
  let boxW = 0, boxH = 0, stepX = 0, cy = 0, sideScale = 0.5, fadeFrom = 2.2, carGap = 40;
  function measure() {
    vw = window.innerWidth;
    vh = window.innerHeight;
    isSP = vw <= 768;
    // 空間での写真の標準の長辺（PC 1440px幅で約190px、スマホで約120px）
    const L = Math.max(118, Math.min(240, vw * 0.13));
    const cellW = L * 1.42;
    const cellH = L * 1.32;
    W = COLS * cellW;
    H = ROWS * cellH;
    photos.forEach((p) => {
      const col = p.i % COLS;
      const row = Math.floor(p.i / COLS);
      // 1段おきに半マスずらす（レンガ積み）＋マス内でランダムにずらす
      p.wx = (col + 0.5 + (row % 2) * 0.5 + p.jx * 0.55) * cellW;
      p.wy = (row + 0.5 + p.jy * 0.5) * cellH;
      const long = L * (0.8 + ((p.depth - 0.72) / 0.5) * 0.45); // 奥ほど小さい
      if (p.ar >= 1) { p.sw = long; p.sh = long / p.ar; } else { p.sh = long; p.sw = long * p.ar; }
    });
    // カルーセル
    boxW = isSP ? vw * 0.84 : Math.min(vw * 0.6, 980);
    boxH = isSP ? vh * 0.5 : vh * 0.6;
    carGap = isSP ? 16 : 40;
    // ドラッグ量→送り枚数の換算に使う「1枚分のおおよその幅」
    stepX = isSP ? vw * 0.8 : boxW * 0.62;
    cy = isSP ? vh * 0.47 : vh * 0.48;
    sideScale = isSP ? 0.72 : 0.5;
    fadeFrom = isSP ? 1.2 : 2.2; // これより遠い写真は画面外なので消していく
  }

  // ---- 空間のカメラ ----
  const cam = { x: 0, y: 0 };
  const vel = { x: 0, y: 0 };           // 慣性（px/ms）
  const DRIFT = { x: 0.018, y: 0.006 }; // 何もしていない時にゆっくり漂う速さ（px/ms）
  let hovering = false;

  // ---- 姿勢の計算 ----
  function spacePose(p) {
    const d = p.depth;
    const x = vw / 2 + wrapDelta(p.wx - cam.x * d, W);
    const y = vh / 2 + wrapDelta(p.wy - cam.y * d, H);
    const near = (d - 0.72) / 0.5; // 0(奥)〜1(手前)
    return { x, y, w: p.sw, h: p.sh, rot: p.rot, op: 0.55 + 0.45 * near, z: Math.round(d * 100) };
  }
  function fit(ar, bw, bh) {
    return ar >= bw / bh ? { w: bw, h: bw / ar } : { w: bh * ar, h: bh };
  }
  // カルーセルの並び。当初は「1枚ごとに一定の間隔（stepX）」で並べていたが、
  // 横長の写真が中央に来ると隣の写真が中央の写真の下に潜り込んでしまった
  // （検証で確認）。フィルムのように「隣り合う2枚の実際の幅の半分ずつ＋
  // すき間」で順番に積み上げて並べる方式に変更した。中央付近の1枚
  // （k0）を基準に、qの端数ぶんだけ隣との距離に比例してずらすので、
  // 送っている途中も位置が連続的に変わる（k0が隣に切り替わる瞬間も
  // 同じ位置になるよう計算している）。1フレームにつき1カテゴリー1回だけ
  // 計算してキャッシュする。
  const layoutCache = {};
  let frameId = 0;
  function carouselLayout(cat) {
    const c = layoutCache[cat];
    if (c && c.frame === frameId) return c.items;
    const list = byCat[cat];
    const n = list.length;
    const q = qByCat[cat];
    const items = new Array(n);
    list.forEach((p) => {
      const rel = wrapDelta(p.k - q, n);
      const s = 1 - (1 - sideScale) * Math.min(Math.abs(rel), 1);
      const f = fit(p.ar, boxW, boxH);
      items[p.k] = { rel, w: f.w * s, h: f.h * s, x: 0 };
    });
    const hw = (k) => items[mod(k, n)].w / 2;
    const k0 = Math.round(q);
    const frac = q - k0; // -0.5〜0.5
    const toward = frac >= 0 ? k0 + 1 : k0 - 1;
    const x0 = vw / 2 - frac * (hw(k0) + carGap + hw(toward));
    items[mod(k0, n)].x = x0;
    let xr = x0, xl = x0;
    const half = Math.floor(n / 2);
    for (let j = 1; j <= half; j++) {
      xr += hw(k0 + j - 1) + carGap + hw(k0 + j);
      items[mod(k0 + j, n)].x = xr;
    }
    for (let j = 1; j <= n - 1 - half; j++) {
      xl -= hw(k0 - j + 1) + carGap + hw(k0 - j);
      items[mod(k0 - j, n)].x = xl;
    }
    layoutCache[cat] = { frame: frameId, items };
    return items;
  }
  function carouselPose(p) {
    const it = carouselLayout(p.cat)[p.k];
    const rel = it.rel;
    return {
      x: it.x,
      y: cy,
      w: it.w,
      h: it.h,
      rot: 0,
      op: clamp01(1 - (Math.abs(rel) - fadeFrom) / 0.8),
      z: 3000 - Math.round(Math.min(Math.abs(rel), 140) * 10),
      rel,
    };
  }

  // ズームイン／アウト中に空間がどこまで縮んで見えるか（描画範囲の計算用）
  let viewScale = 1;

  // ---- 状態 ----
  let activeCat = null;     // 整理中のカテゴリー（空間表示中はnull）
  let dimLevel = 0;         // 暗幕の濃さ 0〜1
  let dimAnim = null;
  let qAnim = null;         // カルーセル送りのアニメーション

  function write(p, key, val, apply) {
    if (p.last[key] !== val) { p.last[key] = val; apply(val); }
  }

  function render() {
    frameId++;
    // ズーム中（viewScale<1）は空間が縮んで見えるので、画面外の写真も描く範囲を広げる
    const mx = (vw / 2) / viewScale - vw / 2 + 40;
    const my = (vh / 2) / viewScale - vh / 2 + 40;
    photos.forEach((p) => {
      const inCat = p.cat === activeCat;
      const sp = spacePose(p);
      let x, y, w, h, rot, op, z;
      if (p.t > 0) {
        const cp = carouselPose(p);
        const e = easeInOut(p.t);
        x = lerp(sp.x, cp.x, e); y = lerp(sp.y, cp.y, e);
        w = lerp(sp.w, cp.w, e); h = lerp(sp.h, cp.h, e);
        rot = lerp(sp.rot, cp.rot, e);
        op = lerp(sp.op, cp.op, e);
        z = cp.z;
        write(p, 'center', inCat && p.t > 0.98 && Math.abs(cp.rel) < 0.5, (v) => onCenterChange(p, v));
      } else {
        ({ x, y, w, h, rot, op, z } = sp);
        // 整理中は、他のカテゴリーの写真を暗幕の下で沈める
        op *= 1 - 0.85 * dimLevel;
        write(p, 'center', false, (v) => onCenterChange(p, v));
      }
      // 画面の外にある写真は描画しない（182枚すべてを毎フレーム描くと重いため）
      const off = x + w / 2 < -mx || x - w / 2 > vw + mx || y + h / 2 < -my || y - h / 2 > vh + my || op < 0.01;
      write(p, 'vis', off ? 'hidden' : '', (v) => { p.el.style.visibility = v; });
      if (off) return;
      write(p, 'w', w.toFixed(1), (v) => { p.el.style.width = v + 'px'; });
      write(p, 'h', h.toFixed(1), (v) => { p.el.style.height = v + 'px'; });
      write(p, 'tf', `translate3d(${(x - w / 2).toFixed(1)}px,${(y - h / 2).toFixed(1)}px,0) rotate(${rot.toFixed(2)}deg)`, (v) => { p.el.style.transform = v; });
      write(p, 'op', op.toFixed(3), (v) => { p.el.style.opacity = v; });
      write(p, 'z', z, (v) => { p.el.style.zIndex = v; });
      // 整理中、他カテゴリーの写真は押せない（暗幕のクリック＝閉じるを優先）
      write(p, 'pe', activeCat && !inCat ? 'none' : '', (v) => { p.el.style.pointerEvents = v; });
    });
    write(dimState, 'op', dimLevel.toFixed(3), (v) => { dim.style.opacity = v; });
  }
  const dimState = { last: {} };

  // ---- アニメーション（1本のrequestAnimationFrameループで全部回す） ----
  function animT(p, to, delay, dur) {
    if (reduceMotion.matches) { p.t = to; p.anim = null; return; }
    p.anim = { from: p.t, to, t0: performance.now() + (delay || 0), dur: dur || 950 };
  }
  function animDim(to) {
    if (reduceMotion.matches) { dimLevel = to; dimAnim = null; return; }
    dimAnim = { from: dimLevel, to, t0: performance.now(), dur: 520 };
  }
  function animQ(target, dur) {
    if (!activeCat) return;
    if (reduceMotion.matches) { qByCat[activeCat] = target; qAnim = null; afterMove(); return; }
    qAnim = { cat: activeCat, from: qByCat[activeCat], to: target, t0: performance.now(), dur: dur || 460 };
  }

  let lastNow = performance.now();
  let drag = null;
  function frame(now) {
    const dt = Math.min(50, now - lastNow);
    lastNow = now;
    // 空間：漂う・慣性
    if (!activeCat && !drag) {
      if (Math.abs(vel.x) + Math.abs(vel.y) > 0.002) {
        cam.x += vel.x * dt; cam.y += vel.y * dt;
        const k = Math.pow(0.94, dt / 16.7);
        vel.x *= k; vel.y *= k;
      } else if (!hovering && !reduceMotion.matches) {
        cam.x += DRIFT.x * dt; cam.y += DRIFT.y * dt;
      }
    }
    // 写真ごとの 空間⇄カルーセル の補間
    photos.forEach((p) => {
      const a = p.anim;
      if (!a) return;
      const t = clamp01((now - a.t0) / a.dur);
      if (now < a.t0) return;
      p.t = lerp(a.from, a.to, t);
      if (t >= 1) { p.t = a.to; p.anim = null; }
    });
    if (dimAnim) {
      const t = clamp01((now - dimAnim.t0) / dimAnim.dur);
      dimLevel = lerp(dimAnim.from, dimAnim.to, easeOut(t));
      if (t >= 1) dimAnim = null;
    }
    if (qAnim) {
      const t = clamp01((now - qAnim.t0) / qAnim.dur);
      qByCat[qAnim.cat] = lerp(qAnim.from, qAnim.to, easeOut(t));
      if (t >= 1) { qByCat[qAnim.cat] = qAnim.to; normalizeQ(qAnim.cat); qAnim = null; }
      afterMove();
    }
    render();
    requestAnimationFrame(frame);
  }

  // qは上下限なしの連続値。止まった時だけ見た目の変わらない範囲へ戻す
  function normalizeQ(cat) { qByCat[cat] = mod(qByCat[cat], byCat[cat].length); }
  const activeK = () => (activeCat ? mod(Math.round(qByCat[activeCat]), byCat[activeCat].length) : 0);

  // ---- 大きい画像の読み込み（中央と両隣だけ） ----
  function ensureLarge(p) {
    if (!p || p.type !== 'photo' || p.large || p.loadingLarge) return;
    p.loadingLarge = true;
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => { p.img.src = im.src; p.large = true; p.loadingLarge = false; };
    im.onerror = () => { p.loadingLarge = false; };
    im.src = srcL(p.id);
  }
  // 動画本体（mp4）は中央に来た時だけ読み込む（隣の写真は先読みする
  // ensureLargeと違い、動画は自動再生しないため隣まで先読みする必要が
  // なく、帯域の無駄になるので中央になった瞬間だけ読み込む）。
  // ポスター画像も、中央に来たタイミングで大きい版（-l.webp）に
  // 差し替える（写真のensureLargeと同じ考え方）。
  function ensureVideo(p) {
    if (!p || p.type !== 'video' || p.videoReady) return;
    p.videoReady = true;
    p.video.poster = srcL(p.id);
    p.video.src = srcV(p.id);
    p.video.load();
  }
  // 中央から外れた動画は、再生中でも止め、コントロールを外して
  // 元の（クリックでカテゴリーが開くだけの）写真同様の見た目に戻す。
  function onCenterChange(p, isCenter) {
    p.el.classList.toggle('is-center', isCenter);
    if (p.type !== 'video') return;
    if (isCenter) {
      ensureVideo(p);
      p.video.controls = true;
    } else {
      p.video.controls = false;
      if (!p.video.paused) p.video.pause();
    }
  }
  function afterMove() {
    if (!activeCat) return;
    const list = byCat[activeCat];
    const k = activeK();
    const n = list.length;
    counter.innerHTML = `<small>${catLabel[activeCat]}</small>${String(k + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`;
    [0, 1, -1].forEach((o) => ensureLarge(list[mod(k + o, n)]));
  }

  // ---- 整理する／やめる ----
  function openCategory(cat, startK) {
    if (activeCat === cat) { if (startK != null) goToK(startK); return; }
    const prev = activeCat;
    if (prev) {
      // 前のカテゴリーの写真は空間へ帰す（遠い写真から順に）
      byCat[prev].forEach((p) => {
        const rel = Math.abs(wrapDelta(p.k - qByCat[prev], byCat[prev].length));
        animT(p, 0, Math.max(0, 6 - Math.min(rel, 6)) * 18, 800);
      });
    }
    activeCat = cat;
    qAnim = null;
    vel.x = 0; vel.y = 0;
    if (startK != null) qByCat[cat] = startK;
    const n = byCat[cat].length;
    // 中央に来る写真から順に、離れた写真ほど少し遅れて飛んでくる
    byCat[cat].forEach((p) => {
      const rel = Math.abs(wrapDelta(p.k - qByCat[cat], n));
      animT(p, 1, (prev ? 160 : 0) + Math.min(rel, 14) * 26, 950);
    });
    animDim(1);
    dim.classList.add('is-on');
    head.classList.add('is-hidden');
    counter.classList.add('is-on');
    closeBtn.hidden = false;
    prevBtn.hidden = false;
    nextBtn.hidden = false;
    tabs.forEach((t) => {
      const on = t.dataset.cat === cat;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    afterMove();
  }

  function closeCategory() {
    if (!activeCat) return;
    const cat = activeCat;
    const n = byCat[cat].length;
    byCat[cat].forEach((p) => {
      const rel = Math.abs(wrapDelta(p.k - qByCat[cat], n));
      animT(p, 0, Math.max(0, 8 - Math.min(rel, 8)) * 16, 900);
    });
    activeCat = null;
    qAnim = null;
    animDim(0);
    dim.classList.remove('is-on');
    head.classList.remove('is-hidden');
    counter.classList.remove('is-on');
    closeBtn.hidden = true;
    prevBtn.hidden = true;
    nextBtn.hidden = true;
    tabs.forEach((t) => { t.classList.remove('is-active'); t.setAttribute('aria-pressed', 'false'); });
  }

  // ---- カルーセル送り ----
  function stepBy(n) {
    if (!activeCat) return;
    const base = qAnim ? qAnim.to : Math.round(qByCat[activeCat]);
    animQ(base + n);
  }
  function goToK(k) {
    if (!activeCat) return;
    const n = byCat[activeCat].length;
    const base = qAnim ? qAnim.to : Math.round(qByCat[activeCat]);
    animQ(base + wrapDelta(k - mod(base, n), n));
  }

  // ---- 操作：ボタン・タブ・キー ----
  tabs.forEach((t) => t.addEventListener('click', () => openCategory(t.dataset.cat)));
  closeBtn.addEventListener('click', closeCategory);
  prevBtn.addEventListener('click', () => stepBy(-1));
  nextBtn.addEventListener('click', () => stepBy(1));
  document.addEventListener('keydown', (e) => {
    if (activeCat) {
      if (e.key === 'Escape') closeCategory();
      if (e.key === 'ArrowRight') stepBy(1);
      if (e.key === 'ArrowLeft') stepBy(-1);
      return;
    }
    const k = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[e.key];
    if (k) { vel.x = k[0] * 0.9; vel.y = k[1] * 0.9; }
  });

  space.addEventListener('pointerover', (e) => { if (e.target.closest('.memlist__photo')) hovering = true; });
  space.addEventListener('pointerout', (e) => { if (e.target.closest('.memlist__photo')) hovering = false; });

  // ---- 操作：ドラッグ（空間はパン、整理中はカルーセル送り） ----
  const DRAG_START = 6;
  let suppressClick = false;
  space.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, active: false, samples: [] };
  });
  space.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0;
    const dy = e.clientY - drag.y0;
    if (!drag.active) {
      if (Math.hypot(dx, dy) < DRAG_START) return;
      drag.active = true;
      drag.x0 = e.clientX; drag.y0 = e.clientY;
      drag.cx = cam.x; drag.cy = cam.y;
      if (activeCat) { qAnim = null; drag.q0 = qByCat[activeCat]; }
      vel.x = 0; vel.y = 0;
      space.setPointerCapture(e.pointerId);
      space.classList.add('is-dragging');
      return;
    }
    const now = performance.now();
    if (activeCat) {
      qByCat[activeCat] = drag.q0 - dx / stepX;
      drag.samples.push({ t: now, v: qByCat[activeCat] });
      afterMove();
    } else {
      cam.x = drag.cx - dx;
      cam.y = drag.cy - dy;
      drag.samples.push({ t: now, x: cam.x, y: cam.y });
    }
    while (drag.samples.length > 2 && now - drag.samples[0].t > 100) drag.samples.shift();
  });
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.active) return;
    space.classList.remove('is-dragging');
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    const a = d.samples[0];
    const b = d.samples[d.samples.length - 1];
    const span = a && b && b.t > a.t ? b.t - a.t : 0;
    if (activeCat) {
      const v = span ? (b.v - a.v) / span : 0;
      const q = qByCat[activeCat];
      let target = Math.round(q + Math.max(-3, Math.min(3, v * 220)));
      if (target === Math.round(d.q0) && Math.abs(q - d.q0) > 0.12) target = Math.round(d.q0) + Math.sign(q - d.q0);
      animQ(target, 420 + Math.min(260, Math.abs(target - q) * 90));
    } else if (span) {
      vel.x = (b.x - a.x) / span;
      vel.y = (b.y - a.y) / span;
    }
  }
  space.addEventListener('pointerup', endDrag);
  space.addEventListener('pointercancel', endDrag);
  space.addEventListener('dragstart', (e) => e.preventDefault());

  // ---- 操作：クリック ----
  space.addEventListener('click', (e) => {
    if (suppressClick) { e.preventDefault(); e.stopPropagation(); return; }
    const el = e.target.closest('.memlist__photo');
    if (!activeCat) {
      // 空間：写真を押したら、その写真のカテゴリーを、その写真を中央にして整理する
      if (el) { const p = photos.find((x) => x.el === el); if (p) openCategory(p.cat, p.k); }
      return;
    }
    // 整理中：脇の写真はその写真へ送る／枠外（暗幕）は空間へ戻る
    if (el) {
      const p = photos.find((x) => x.el === el);
      if (p && p.cat === activeCat && p.k !== activeK()) goToK(p.k);
      return;
    }
    closeCategory();
  }, true);

  // ---- 操作：ホイール ----
  let wheelLock = false;
  let wheelSnap = 0;
  space.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (!activeCat) {
      // 空間：トラックパッドの2本指スクロール／マウスホイールで空間を動かす
      vel.x = 0; vel.y = 0;
      cam.x += e.deltaX;
      cam.y += e.deltaY;
      return;
    }
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      qAnim = null;
      qByCat[activeCat] += e.deltaX / stepX;
      afterMove();
      clearTimeout(wheelSnap);
      wheelSnap = setTimeout(() => animQ(Math.round(qByCat[activeCat]), 360), 140);
      return;
    }
    if (Math.abs(e.deltaY) < 12 || wheelLock) return;
    wheelLock = true;
    setTimeout(() => { wheelLock = false; }, 420);
    stepBy(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });

  window.addEventListener('resize', () => {
    measure();
    photos.forEach((p) => { p.last = {}; });
  });

  // ---- ページの出入り（ズームイン／ズームアウト） ----
  // 入場：本人構想「トップページの写真が流れる空間に入り込む（ズーム
  // インする感じ）」。トップページ側で空間を拡大しながら暗転して
  // 遷移してくるので、こちらは暗幕が消えながら、奥（小さい状態）から
  // 手前へ空間が迫ってくる＝前へ進み続けているように見せる。
  // ※空間は画面いっぱいの箱（overflow:hidden）なので、縮めると箱の縁が
  // 四角く見えてしまう（検証で確認）。ズーム中だけ箱の外まで写真を描画
  // （overflow:visible＋描画範囲を広げる＝viewScale）して、縮んでも
  // 周りが写真で埋まっているようにしている。
  function setZooming(scale) {
    viewScale = scale;
    space.style.overflow = scale < 1 ? 'visible' : '';
    photos.forEach((p) => { p.last = {}; });
  }
  function enter() {
    if (reduceMotion.matches || typeof world.animate !== 'function') {
      fade.style.opacity = '0';
      return;
    }
    setZooming(0.62);
    const z = world.animate(
      [{ transform: 'scale(0.62)' }, { transform: 'scale(1)' }],
      { duration: 1300, easing: 'cubic-bezier(.16,.84,.24,1)', fill: 'both' }
    );
    z.finished.then(() => setZooming(1), () => setZooming(1));
    fade.style.opacity = '0';
    fade.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 800, easing: 'ease-out', fill: 'both' });
  }

  // 退場：本人構想「MEMORYに戻るボタンを押す／ズームアウトしてトップページに
  // 戻る」。空間が小さく遠ざかりながら暗転し、トップページ側は大きい状態から
  // 等倍へ縮みながら現れる（index.html末尾のrevealFromMemory参照）。
  let leaving = false;
  backLink.addEventListener('click', (e) => {
    e.preventDefault();
    if (leaving) return;
    leaving = true;
    const href = backLink.getAttribute('href') || 'index.html';
    const go = () => {
      if (window.wlpPageTransition && window.wlpPageTransition.markReturnToMemory) {
        window.wlpPageTransition.markReturnToMemory();
      }
      window.location.href = href;
    };
    if (reduceMotion.matches || typeof world.animate !== 'function') { go(); return; }
    setZooming(0.6);
    world.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(0.6)' }],
      { duration: 700, easing: 'cubic-bezier(.55,0,.75,.2)', fill: 'forwards' }
    );
    const a = fade.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, easing: 'ease-in', fill: 'forwards' });
    a.onfinish = go;
  });

  measure();
  render();
  requestAnimationFrame((now) => { lastNow = now; requestAnimationFrame(frame); });
  enter();
})();

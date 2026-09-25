/* ==========================================================
   最後のページ（TO BE CONTINUEDシーン）を漂うモチーフの移動。
   対象：tbc-13〜16（花束・ギフト・封筒・シャンパングラス）と
         tbc-20〜27（スノーボード・ウイスキー・デロリアン・ONE OK ROCK・
         クロミ・モンチッチ・黒い豆型キャラクター・プテラノドン）。

   本人指示：「最後のページのtbc13〜16,tbc-20〜27の動きを改善したい。
   加速減速は無くして。tbc-22,23は本体がその場で回転する指定をなくして
   直進するようにしたい。tbc-22は左下から右上に向かって直進、tbc23は
   画面右から左へ直進でお願い。この二つ以外は他のオブジェクトと重なったり
   していいのでランダムに散るように。直進するのもあれば、円弧に沿って
   動くものも。」

   ▼以前（style.cssの@keyframes tbc-motif-drift-*）との違い
   以前はCSSのkeyframesで「決まった経路を、ease-in-outで加速・減速
   しながら」毎回同じように往復していた。これをJSのWeb Animations APIに
   置き換え、1回通り過ぎるたびに新しい経路をランダムに決め直す。
   - 経路は「画面の外のどこか → 画面を横切って → 反対側の画面の外」。
     半分くらいは直線、残りは円弧（曲がり具合もランダム）。
   - 加速・減速をなくすため、アニメーションのeasingはlinear。円弧は
     「角度を均等に刻んだ点」をキーフレームにしているので、曲線に沿って
     進む速さも一定になる（点の間隔が同じ＝同じ時間で同じ距離進む）。
     所要時間は「経路の長さ÷速さ」で決めるので、長い経路でも短い経路
     でも同じ速さで動く。
   - 通り過ぎたら、少し間を空けて（画面外にいる間）次の経路で再出発。
   - ページを開いた瞬間から画面のあちこちに散らばって見えるよう、
     1回目だけは経路の途中（ランダムな位置）から始める。
   - その場での回転（内側の.tbc-scene__motif-imgのCSSアニメーション）は
     そのまま継続。ただしtbc-22（デロリアン）とtbc-23（ONE OK ROCK）
     だけは回転を止め、指定どおりの向きへまっすぐ進ませる。
   - prefers-reduced-motion: reduce では動かさない（style.css側で
     回転も止めている）。
=========================================================== */
(() => {
  const scene = document.getElementById('tbcScene');
  if (!scene) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const items = [...scene.querySelectorAll('.tbc-scene__motif')];
  if (!items.length || typeof items[0].animate !== 'function') return;

  const rand = (a, b) => a + Math.random() * (b - a);
  const BASE_W = 1440; // 速さはこの画面幅を基準にして、画面幅に比例させる

  // 種類ごとの設定。speed：px/秒（1440px幅の時）
  const FIXED = {
    // tbc-22 デロリアン：左下→右上へ直進（回転なし）
    delorean: { speed: [150, 150], path: 'diagUp', noSpin: true },
    // tbc-23 ONE OK ROCK：右→左へ直進（回転なし）
    oneokrock: { speed: [95, 95], path: 'rightToLeft', noSpin: true },
  };
  // 手前の4点（花束・ギフト・封筒・シャンパン）は少し速め、奥の8点は遅め
  const FRONT = ['bouquet', 'gift', 'envelope', 'champagne'];

  function kindOf(el) {
    const m = [...el.classList].map((c) => c.match(/^tbc-scene__motif--(.+)$/)).find(Boolean);
    return m ? m[1] : '';
  }

  function sceneSize() {
    const r = scene.getBoundingClientRect();
    return { W: r.width || window.innerWidth, H: r.height || window.innerHeight };
  }

  // 画面の外周（要素の大きさぶん外側）上の点。side: 0上 1右 2下 3左
  function edgePoint(side, W, H, w, h) {
    const m = 24;
    switch (side) {
      case 0: return { x: rand(-w, W), y: -h - m };
      case 1: return { x: W + m, y: rand(-h, H) };
      case 2: return { x: rand(-w, W), y: H + m };
      default: return { x: -w - m, y: rand(-h, H) };
    }
  }

  // ランダムな経路（直線 or 円弧）を、等間隔の点の列として返す
  function randomPath(W, H, w, h) {
    const s0 = Math.floor(Math.random() * 4);
    // 出口は入口と違う辺（向かいの辺になりやすいよう重み付け）
    const s1 = Math.random() < 0.6 ? (s0 + 2) % 4 : (s0 + (Math.random() < 0.5 ? 1 : 3)) % 4;
    let a, b;
    for (let tries = 0; tries < 8; tries++) {
      a = edgePoint(s0, W, H, w, h);
      b = edgePoint(s1, W, H, w, h);
      if (Math.hypot(b.x - a.x, b.y - a.y) > Math.min(W, H) * 0.9) break;
    }
    if (Math.random() < 0.5) return [a, b]; // 直線
    // 円弧：弦abの中点から、弦の長さ×(0.12〜0.35)だけ横へふくらませる
    const dx = b.x - a.x, dy = b.y - a.y;
    const c = Math.hypot(dx, dy);
    const sag = c * rand(0.12, 0.35) * (Math.random() < 0.5 ? -1 : 1);
    // 弦と矢高から円の半径と中心を求める
    const r = (c * c / 4 + sag * sag) / (2 * Math.abs(sag));
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const nx = -dy / c, ny = dx / c; // 弦に垂直な単位ベクトル
    const dir = Math.sign(sag);
    // 中心は弦の中点から「ふくらみと反対側」へ (半径−矢高) だけ離れた所
    const cx = mx - nx * dir * (r - Math.abs(sag));
    const cy = my - ny * dir * (r - Math.abs(sag));
    const ang = (p) => Math.atan2(p.y - cy, p.x - cx);
    let t0 = ang(a), t1 = ang(b);
    // ふくらみ側（中点＋矢高の点）を通る向きで回る
    const peak = { x: mx + nx * sag, y: my + ny * sag };
    const tp = ang(peak);
    const between = (x, lo, hi) => { const d = (hi - lo + Math.PI * 4) % (Math.PI * 2); const e = (x - lo + Math.PI * 4) % (Math.PI * 2); return e <= d; };
    let sweep = (t1 - t0 + Math.PI * 4) % (Math.PI * 2);
    if (!between(tp, t0, t1)) sweep -= Math.PI * 2; // 逆回り
    const N = 28;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const t = t0 + (sweep * i) / N;
      pts.push({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) });
    }
    return pts;
  }

  function fixedPath(kind, W, H, w, h) {
    if (kind === 'diagUp') {
      // 左下の画面外 → 右上の画面外（少しずつ角度をばらつかせる）
      return [
        { x: -w - 24, y: rand(H * 0.55, H + 10) },
        { x: W + 24, y: rand(-h - 10, H * 0.35 - h) },
      ];
    }
    // 右の画面外 → 左の画面外（水平にまっすぐ）
    const y = rand(H * 0.12, H * 0.72 - h);
    return [{ x: W + 24, y }, { x: -w - 24, y }];
  }

  function pathLength(pts) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return L;
  }

  function run(el, first) {
    const kind = kindOf(el);
    const fixed = FIXED[kind];
    const { W, H } = sceneSize();
    const w = el.offsetWidth || 100;
    const h = el.offsetHeight || 100;
    const pts = fixed ? fixedPath(fixed.path, W, H, w, h) : randomPath(W, H, w, h);
    const range = fixed ? fixed.speed : (FRONT.includes(kind) ? [70, 115] : [40, 80]);
    const speed = rand(range[0], range[1]) * (W / BASE_W); // px/秒
    const dur = (pathLength(pts) / speed) * 1000;
    const anim = el.animate(
      pts.map((p) => ({ transform: `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)` })),
      { duration: dur, easing: 'linear', fill: 'both' }
    );
    if (first) anim.currentTime = dur * rand(0.15, 0.85); // 最初から画面のあちこちに散らばって見えるように
    anim.onfinish = () => {
      anim.cancel();
      el.style.transform = 'translate3d(-9999px, -9999px, 0)'; // 次に出てくるまで画面外に置いておく
      setTimeout(() => run(el, false), rand(300, 1800));
    };
  }

  items.forEach((el) => {
    const fixed = FIXED[kindOf(el)];
    // CSS側のkeyframesによる移動（tbc-motif-drift-*）と配置（left/top）を無効化し、
    // 位置はこのスクリプトのtranslateだけで決める。
    el.style.animationName = 'none';
    el.style.left = '0px';
    el.style.top = '0px';
    if (fixed && fixed.noSpin) {
      const img = el.querySelector('.tbc-scene__motif-img');
      if (img) img.style.animationName = 'none';
    }
    run(el, true);
  });
})();

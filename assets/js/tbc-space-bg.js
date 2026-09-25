/* ==========================================================
   PAGE 8（TBC scene）背景：Canvasで瞬く星＋時々流れる流れ星

   本人指示：「背景をこのサイトで作ったような宇宙空間にしてみたい」
   （新しく接続された「1作品目／提出用／export」フォルダ内の
   index.html＝本人が既に提出済みの別ポートフォリオページを指して
   いる。そちらのCanvas上に星を瞬かせ、たまに流れ星を走らせる背景
   演出を参照元として、TBCシーンの背景（旧assets/img/tbc-10.jpg）
   と置き換えるかたちで移植した）。

   ロジック（星の生成・瞬きのサインカーブ・大きい星のスパークル
   クロス・流れ星の生成間隔／軌道／フェードアウト）は参照元と
   ほぼ同一。canvasの要素IDと、このサイトの規約
   （即時実行IIFE・DOMContentLoaded不要＝bodyの一番下でscriptタグを
   読み込む・prefers-reduced-motion対応）に合わせて移植した点のみ
   異なる。

   reduced-motionの場合：他の常時ループ演出（ロケットの微振動・月の
   回転・エイリアン周回・浮遊）と同じ方針で、requestAnimationFrame
   ループ自体を回さず、星を一度だけ静止した明るさで描画して終える
   （流れ星は動きが前提の演出なので出さない）。 */
(function () {
  'use strict';

  var canvas = document.getElementById('tbcSceneStars');
  if (!canvas || !canvas.getContext) return;

  var ctx = canvas.getContext('2d');
  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var w = 0, h = 0, stars = [], shooters = [], raf = null;

  function resize() {
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var n = Math.round(w * h / 5200);
    stars = [];
    for (var i = 0; i < n; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.1 + 0.25,
        base: Math.random() * 0.45 + 0.15,
        sp: Math.random() * 0.9 + 0.25,
        ph: Math.random() * Math.PI * 2,
        big: Math.random() < 0.05
      });
    }
    if (reduceMotion) drawStatic();
  }

  function drawStatic() {
    ctx.clearRect(0, 0, w, h);
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(226,238,255,' + s.base + ')';
      ctx.fill();
    }
  }

  var next = 900;
  function spawn() {
    var fromLeft = Math.random() < 0.6;
    shooters.push({
      x: fromLeft ? Math.random() * w * 0.5 : w * (0.5 + Math.random() * 0.5),
      y: Math.random() * h * 0.45,
      vx: (fromLeft ? 1 : -1) * (5 + Math.random() * 3),
      vy: 2.2 + Math.random() * 1.6,
      life: 1
    });
  }

  function tick(t) {
    ctx.clearRect(0, 0, w, h);
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var al = Math.max(0, Math.min(1, s.base + Math.sin(t / 1000 * s.sp + s.ph) * 0.45));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(226,238,255,' + al + ')';
      ctx.fill();
      if (s.big && al > 0.7) {
        var g = (al - 0.7) * 3.2, L = 5 + g * 7;
        ctx.strokeStyle = 'rgba(190,220,255,' + (g * 0.55) + ')';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(s.x - L, s.y); ctx.lineTo(s.x + L, s.y);
        ctx.moveTo(s.x, s.y - L); ctx.lineTo(s.x, s.y + L);
        ctx.stroke();
      }
    }
    if (t > next) { spawn(); next = t + 2600 + Math.random() * 4200; }
    shooters = shooters.filter(function (s) {
      return s.life > 0 && s.x > -200 && s.x < w + 200 && s.y < h + 200;
    });
    for (var k = 0; k < shooters.length; k++) {
      var sh = shooters[k];
      sh.x += sh.vx; sh.y += sh.vy; sh.life -= 0.012;
      var gr = ctx.createLinearGradient(sh.x, sh.y, sh.x - sh.vx * 13, sh.y - sh.vy * 13);
      gr.addColorStop(0, 'rgba(255,255,255,' + Math.max(0, sh.life) + ')');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = gr;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(sh.x, sh.y);
      ctx.lineTo(sh.x - sh.vx * 13, sh.y - sh.vy * 13);
      ctx.stroke();
    }
    raf = requestAnimationFrame(tick);
  }

  resize();
  window.addEventListener('resize', resize);

  // 本人指摘「ページの最後が重い」への対応：以前はサイトを開いた瞬間
  // からずっとループしていたが、PAGE 8（#page-tbc-scene）が表示中
  // （is-active）の間だけ描画ループを回し、それ以外は止める。
  var scenePage = document.getElementById('page-tbc-scene');
  function syncLoop() {
    if (reduceMotion) return;
    var active = !scenePage || scenePage.classList.contains('is-active');
    if (active && raf === null) {
      if (!w || !h) resize();
      raf = requestAnimationFrame(tick);
    } else if (!active && raf !== null) {
      cancelAnimationFrame(raf);
      raf = null;
    }
  }
  if (scenePage) {
    new MutationObserver(syncLoop).observe(scenePage, {
      attributes: true,
      attributeFilter: ['class']
    });
  }
  syncLoop();
})();

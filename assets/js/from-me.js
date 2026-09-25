/* ==========================================================
   FROM ME：背景動画の再生管理 ＋ メッセージ本文の登場演出

   (1) 動画再生：ページが画面に入っている間だけ再生し、Q&A以前では
       停止して不要な読み込み・再生を避ける。ページの登場位置は
       pager.jsが管理する。

   (2) 本文の登場（setReveal）：もともとcodex版は「is-activeクラスが
       付いたらCSS transitionでふわっと」という作りだったが、is-active
       は実際にはQ&A→FROM MEのプッシュ演出が始まった"瞬間"（＝まだ
       画面の下に隠れている段階）に付与されるため、実際にスクロールで
       映像が画面内へ現れるタイミングとCSS transitionの再生タイミングが
       噛み合わず、「動画のセクションに入ってから文字がすぐ出てこない
       （＝もう終わっているか、まだ始まっていないかのどちらか）」という
       症状になっていた（本人指摘）。
       他セクション（QA・ABOUTなど）と同じ「スクロール位置(ratio)の
       連続関数として毎フレーム直接styleを書き換える」方式に作り直し、
       pager.js側から渡されるratio（QA→FROM MEのアイリス切り替えの
       進み具合を0〜1に再マッピングしたもの。詳細はpager.js側の
       フェーズFコメント参照）をそのまま受け取って1行ずつの不透明度／
       位置を計算する。結びの言葉というトーンに合わせ、QAのような
       バウンドは使わずeaseOutCubicのみで静かに上へ現れるようにしている。
=========================================================== */
(() => {
  const page = document.getElementById('page-from-me');
  const video = document.getElementById('fromMeVideo');
  const lines = Array.from(document.querySelectorAll('#fromMeMessage .from-me__line'));

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (page && video) {
    const syncPlayback = () => {
      if (page.classList.contains('is-active')) {
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {});
        }
      } else {
        video.pause();
      }
    };

    new MutationObserver(syncPlayback).observe(page, {
      attributes: true,
      attributeFilter: ['class'],
    });

    syncPlayback();
  }

  function clamp01(v) { return Math.min(1, Math.max(0, v)); }
  function easeOutCubic(t) { const x = clamp01(t); return 1 - Math.pow(1 - x, 3); }

  // reduced-motionなら最初から全行を最終状態で固定し、以降setReveal()を
  // 呼んでも何もしない（qa.jsと同じ方針）。
  if (reduceMotion) {
    lines.forEach((line) => {
      line.style.opacity = '1';
      line.style.transform = 'none';
    });
  }

  // 9行ぶんを、映像が画面に入ってくるプッシュ比率(0〜1)の後半に
  // 少しずつ重ねてずらして割り当てる。映像が定位置に収まりきる
  // （ratio=1）のと同時に最後の行が現れきるようにしている。
  const REVEAL_START = 0.25; // ここまでは映像そのものの登場を邪魔しない
  const REVEAL_END = 1.0;
  const WINDOW = 0.35;       // 1行ぶんの遷移窓（重なりぶん、隣の行と滑らかにつながる）
  const RISE_EM = 0.5;       // 現れる前の下方向オフセット量

  function setReveal(ratio) {
    if (reduceMotion || lines.length === 0) return;
    const overall = clamp01(ratio);
    const span = REVEAL_END - REVEAL_START;
    const step = lines.length > 1 ? (span - WINDOW) / (lines.length - 1) : 0;

    lines.forEach((line, i) => {
      const start = REVEAL_START + step * i;
      const local = span > 0 ? (overall - start) / WINDOW : 1;
      const eased = easeOutCubic(local);
      line.style.opacity = String(clamp01(local <= 0 ? 0 : eased));
      line.style.transform = `translateY(${(1 - clamp01(eased)) * RISE_EM}em)`;
    });
  }

  window.fromMeSection = { setReveal };
})();

/* ==========================================================
   MEMORY「もっと思い出を振り返る」ボタン（index.html #memoryMore）。
   本人構想「『もっと思い出を振り返る』ボタンを押す／トップページの
   写真が流れる空間に入り込む（ズームインする感じ）」への対応。
   押したら、MEMORYの空間（.memory__stage）をボタンの位置を中心に
   拡大しながら背景色の暗幕で覆い（page-transition.jsのzoomInCover）、
   覆い終えた瞬間にmemory-list.htmlへ移る。下層ページ側は、暗幕が
   晴れながら空間が奥から迫ってくる動きで続きを見せる
   （assets/js/memory-list.jsのenter()）。
=========================================================== */
(() => {
  const btn = document.getElementById('memoryMore');
  const stage = document.querySelector('#page-memory .memory__stage');
  if (!btn || !stage) return;

  let leaving = false;
  btn.addEventListener('click', (e) => {
    if (!window.wlpPageTransition || !window.wlpPageTransition.zoomInCover) return; // 通常のリンクとして遷移
    e.preventDefault();
    if (leaving) return;
    leaving = true;
    const href = btn.getAttribute('href');
    // ズーム中に写真がカーソルの下を通っても、MEMORYのカーソルラベル
    // （memory-cursor.js）が出てこないように隠しておく
    const cursor = document.getElementById('memoryCursor');
    if (cursor) cursor.style.visibility = 'hidden';
    // 拡大の中心＝ボタンの中心（.memory__stage内での位置を%で渡す）
    const s = stage.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    const ox = ((b.left + b.width / 2 - s.left) / s.width) * 100;
    const oy = ((b.top + b.height / 2 - s.top) / s.height) * 100;
    window.wlpPageTransition.zoomInCover(stage, {
      origin: `${ox.toFixed(2)}% ${oy.toFixed(2)}%`,
      onDone: () => { window.location.href = href; },
    });
  });

  // ブラウザの「戻る」でこのページに戻ってきた時（bfcacheから復元された時）、
  // ズームした状態・暗幕が残ったままにならないよう元に戻す。
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    leaving = false;
    stage.getAnimations().forEach((a) => a.cancel());
    stage.style.transformOrigin = '';
    const mask = document.getElementById('pageTransitionMask');
    if (mask) mask.remove();
    const cursor = document.getElementById('memoryCursor');
    if (cursor) cursor.style.visibility = '';
  });
})();

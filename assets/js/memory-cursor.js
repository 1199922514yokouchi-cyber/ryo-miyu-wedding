/* ==========================================================
   MEMORY「カーソルラベル」：MEMORYセクション（背景・写真も含めた
   .memory__stage全体）にマウスが乗っている間、円形バッジ(#memoryCursor)
   をマウス位置に少し遅れて追従させる。
   - 背景／写真の上：MEMORYの文字を円周上に流したリング表示
   - 動画カードの上だけ：PLAY（再生中はSTOP）の文字表示に切り替え

   #memoryCursorはindex.html側で <body> 直下（.scroll-stageの外）に
   置いてある。理由：pager.jsはMEMORYが重なって現れる演出で
   #page-memory の .page__frame に直接transformを当てるが、
   transformがかかった要素の子孫では position:fixed が「画面」ではなく
   「そのtransformされた祖先」を基準にしてしまう（CSSの仕様）。
   カーソルラベルは常にマウスの実座標＝ウィンドウ基準で動いてほしいので、
   transformの影響を受けない場所（body直下）に置く必要がある。

   タッチ端末（hover非対応）では独自カーソルは出さず、何もしない
   （普通のタップ操作に任せる）。
=========================================================== */
(() => {
  const cursor = document.getElementById('memoryCursor');
  const memoryPage = document.getElementById('page-memory');
  const stage = memoryPage ? memoryPage.querySelector('.memory__stage') : null;
  if (!cursor || !memoryPage || !stage) return;

  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!canHover) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // マウス位置への追従の緩さ（0〜1、大きいほどキビキビ、小さいほど
  // 遅れてついてくる。ここは常時動くものではないので緩めでよい）。
  const FOLLOW_EASE = reduceMotion ? 1 : 0.22;

  const pos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const target = { x: pos.x, y: pos.y };
  let rafId = null;

  function tick() {
    pos.x += (target.x - pos.x) * FOLLOW_EASE;
    pos.y += (target.y - pos.y) * FOLLOW_EASE;
    // 位置はここで直接反映する（opacity/scaleの出入りはCSS側のtransitionに任せる）。
    cursor.style.transform = `translate(${pos.x}px, ${pos.y}px)`;

    const closeEnough = Math.abs(target.x - pos.x) < 0.5 && Math.abs(target.y - pos.y) < 0.5;
    if (!closeEnough) {
      rafId = requestAnimationFrame(tick);
    } else {
      rafId = null;
    }
  }

  function requestTick() {
    if (rafId === null) rafId = requestAnimationFrame(tick);
  }

  window.addEventListener(
    'pointermove',
    (e) => {
      target.x = e.clientX;
      target.y = e.clientY;
      if (reduceMotion) {
        pos.x = target.x;
        pos.y = target.y;
        cursor.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
      } else {
        requestTick();
      }
    },
    { passive: true }
  );

  // PLAY⇔STOPの文言はtextContentの書き換えではなく、あらかじめ両方を
  // 重ねて置いてあるテキスト同士をCSS側でopacityクロスフェードさせる
  // ("is-stop"クラスの付け外しのみ)。これでMEMORYリング⇔PLAY/STOPの
  // 切り替えと同じく0.3sで自然にトランジションする。
  function setPlayLabel(isPlaying) {
    cursor.classList.toggle('is-stop', isPlaying);
  }

  // 動画クリックで再生⇔一時停止が切り替わった瞬間、カーソルが乗った
  // ままでもラベルの文言(PLAY/STOP)をすぐ追従させられるよう、
  // memory-video.js側から呼べる更新関数をここで公開しておく。
  window.__memoryUpdateCursorPlayLabel = setPlayLabel;

  // 背景を含むMEMORYセクション全体をホバー対象にする：
  // .memory__stageに入っている間はずっとリング（またはPLAY/STOP）を表示し、
  // 動画カードの上に乗った時だけPLAY/STOP表示に切り替える。
  stage.addEventListener('mouseenter', () => {
    cursor.classList.add('is-visible');
  });

  stage.addEventListener('mouseleave', () => {
    cursor.classList.remove('is-visible');
    cursor.classList.remove('is-play');
    cursor.classList.remove('is-more');
  });

  // 「もっと思い出を振り返る」ボタン（#memoryMore）の上では、動画カードの
  // PLAY/STOPと同じ要領でMORE表示に切り替える。
  stage.addEventListener('mouseover', (e) => {
    if (e.target.closest('.memory__more')) cursor.classList.add('is-more');
  });
  stage.addEventListener('mouseout', (e) => {
    const btn = e.target.closest('.memory__more');
    if (btn && !(e.relatedTarget && btn.contains(e.relatedTarget))) {
      cursor.classList.remove('is-more');
    }
  });

  stage.addEventListener('mouseover', (e) => {
    const videoCard = e.target.closest('[data-cursor="play"]');
    if (!videoCard) return;
    cursor.classList.add('is-play');
    setPlayLabel(videoCard.classList.contains('is-playing'));
  });

  stage.addEventListener('mouseout', (e) => {
    const leavingCard = e.target.closest('[data-cursor="play"]');
    if (!leavingCard) return;
    const stillInsideCard = e.relatedTarget && leavingCard.contains(e.relatedTarget);
    if (!stillInsideCard) {
      cursor.classList.remove('is-play');
    }
  });
})();

/* ==========================================================
   MEMORYギャラリー内の動画カード：クリックでカード内再生⇔一時停止を
   切り替える（フルスクリーンにはしない＝「動画はカード内で再生する」
   という指示のまま）。カーソルを乗せている間はPLAY（再生中はSTOP）の
   カーソルラベルが出る（挙動は assets/js/memory-cursor.js側、
   data-cursor="play"）。

   「memory:leave」イベントはMEMORYセクションから本当に離れた時だけ
   pager.js側から発火する（フェーズC以外に切り替わった時）。以前は
   スクロールの慣性が収まる途中の毎フレームで誤発火し、スクロール中に
   動画が止まってしまう不具合があったため、pager.js側で本当に
   MEMORYを離れた瞬間だけ発火するよう修正済み。
=========================================================== */
(() => {
  document.querySelectorAll('.memory__video-card').forEach((card) => {
    const video = card.querySelector('.memory__video');
    if (!video) return;

    function updateCursorLabel() {
      // video.pausedは環境によって同期的に反映されないことがあるため、
      // アイコン表示と同じく「再生中の意図」を表すis-playingクラスを
      // 単一の真実の情報源として使う。
      if (window.__memoryUpdateCursorPlayLabel) {
        window.__memoryUpdateCursorPlayLabel(card.classList.contains('is-playing'));
      }
    }

    function togglePlay() {
      if (video.paused) {
        // 最初の再生はミュート込みの自動再生ではなく、クリックという
        // ユーザー操作の直後なので、音声ありで再生してよい。
        video.muted = false;
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {
            // 稀に音声ありの再生がブロックされた場合は、ミュートで再試行する
            video.muted = true;
            video.play().catch(() => {});
          });
        }
        card.classList.add('is-playing');
      } else {
        video.pause();
        card.classList.remove('is-playing');
      }
      updateCursorLabel();
    }

    card.addEventListener('click', togglePlay);
    video.addEventListener('ended', () => {
      card.classList.remove('is-playing');
      updateCursorLabel();
    });

    // ページが切り替わって画面外に隠れた時も、音や再生が裏で続かないように止める
    window.addEventListener('memory:leave', () => {
      video.pause();
      card.classList.remove('is-playing');
      updateCursorLabel();
    });
  });
})();

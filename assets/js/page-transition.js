/* ==========================================================
   ページ間の「サークルマスク」遷移（PT-09）。
   index.html（MESSAGEカード）⇄ message-list.html（メッセージ一覧）の
   行き来を、画面中央から円が広がる/すぼまる動きでつなぐための共通
   モジュール。

   本人フィードバックを受けて、当初の「広がって覆う→遷移→すぼまって
   見せる」という2段階の動きから、各ページそれぞれ「1回だけ」円が
   動く方式に変更した：
     - 行き（index→message-list）：message-list.html側で、ページの
       中身そのものを円形にクリップし、中心（画面中央固定）から
       円が広がりながら中身が現れる＝「広がる」動きそのものが
       「表示される」動きを兼ねる（中身を隠す側ではなく見せる側の
       要素にclip-pathを掛ける）。index.html側では特にアニメーション
       せず、クリックしたら即座に遷移するだけ。
     - 帰り（message-list→index）：index.html側で、画面全体を覆う
       単色オーバーレイを用意し、それが画面中央を中心に大きい円から
       0%へすぼまりながら消えていく＝「覆っていたものが中央に向かって
       閉じていく」動き。message-list.html側では特にアニメーションせず、
       「MESSAGEに戻る」を押したら即座に遷移するだけ。
   円の中心は常に画面中央（50%, 50%）固定（以前はクリックしたカード／
   ボタンの位置を中心にしていたが、本人指示「画面中央からのマスクが
   いい」を受けて撤廃）。

   遷移の意思（「戻ってきた」かどうか）だけをsessionStorageで次の
   ページへ橋渡しする。

   ※index.html（MEMORYの「もっと思い出を振り返る」）⇄ memory-list.html
   （MEMORY下層ページ）の行き来は、サークルマスクではなく本人構想の
   「ズームイン／ズームアウト」（zoomInCover／zoomOutReveal、下の
   apiの末尾参照）。「戻ってきた」印もメッセージとは別の
   キー（wlpReturnToMemory）で渡す。
=========================================================== */
(() => {
  const RETURN_KEY = 'wlpReturnToMessage';
  const MEMORY_RETURN_KEY = 'wlpReturnToMemory';
  const MEMORY_BG = '#282828'; // MEMORYの背景色（style.cssの.memoryと同じ）
  const BG = 'linear-gradient(178deg, #FDD22B 0%, #FFF1BB 60%)';
  // 本人指摘「サークルマスクは下層ページ行く時できてたけど、早すぎる」
  // への対応：650ms→1000msへ伸ばし、円が広がる/すぼまる動きを
  // もう少しゆったり見せる。
  const DURATION = 1000; // ms
  const EASING = 'cubic-bezier(.2,.8,.2,1)';

  function clipTo(el, radiusPct) {
    el.style.clipPath = `circle(${radiusPct}% at 50% 50%)`;
  }

  // elのclip-pathをfromPct→toPctへアニメーションする。中心は常に画面中央。
  //
  // 本人報告「サークルマスクができてない（行きだけ）」への対応：
  // 以前はCSSの`transition`プロパティを使い、「transition:noneで0%に
  // 固定→reflow確定→次のrAFでtransitionを有効化して目標値へ」という
  // 手順で無理やりアニメーションさせていたが、rAFを2重にしても改善せず、
  // 実機（本人のMac）では直らなかった。message-list.htmlのように読み込み
  // 直後にごく短い遅延でアニメーションを開始する場面では、
  // 「transition:noneを外すタイミング」と「実際に新しい値を適用する
  // タイミング」の間に本当に1フレーム分の描画が挟まったかどうかが
  // ブラウザ・実行環境によって不確実で、確実性に欠けていた。
  // そこで、CSSのtransitionに頼るのをやめ、Web Animations API
  // （Element.animate()）に切り替えた。animate()は呼び出した時点の
  // 要素の「現在の見た目」に関係なく、指定したfrom/toのキーフレームを
  // 必ずその通りに、指定した時間をかけて再生することが保証されている
  // （CSSのtransitionのように「前のフレームで実際に値が変わって
  // いないと発火しない」という不確実性がない）。フォールバックとして
  // animate()が使えない古い環境向けに、従来のtransitionベースの実装も
  // 残してある。
  function animateClip(el, fromPct, toPct, { duration = DURATION, onDone } = {}) {
    if (typeof el.animate === 'function') {
      clipTo(el, toPct); // animate()終了後もこの値が最終状態として残るよう先に設定しておく
      const anim = el.animate(
        [
          { clipPath: `circle(${fromPct}% at 50% 50%)` },
          { clipPath: `circle(${toPct}% at 50% 50%)` },
        ],
        { duration, easing: EASING, fill: 'both' }
      );
      const finish = () => { if (onDone) onDone(); };
      if (anim.finished && typeof anim.finished.then === 'function') {
        anim.finished.then(finish, finish);
      } else {
        anim.onfinish = finish;
      }
      return;
    }
    // フォールバック（Web Animations API非対応の環境向け）。
    el.style.transition = 'none';
    clipTo(el, fromPct);
    void el.offsetWidth; // reflow確定（transition:noneを実際に反映させるため）
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = `clip-path ${duration}ms ${EASING}`;
        clipTo(el, toPct);
      });
    });
    if (onDone) window.setTimeout(onDone, duration + 60);
  }

  // X06（賑やかなページ遷移カタログ「カウンターが割り込む」）の
  // 「幕がそのまま上へスライドして抜ける」reveal。elをtranslateY(0)→
  // translateY(-101%)へ動かし、終わったら要素を除去する。
  // サークルマスクのshrinkOverlayAway（円がすぼまる）とは別の「開き方」
  // として、PT-13サイトローダー（assets/js/site-loader.js）の後段で使う。
  const SLIDE_DURATION = 460; // ms：X06実物と同じ長さ
  const SLIDE_EASING = 'cubic-bezier(.76,0,.24,1)'; // X06実物と同じイージング

  function animateSlide(el, fromPct, toPct, { duration = SLIDE_DURATION, onDone } = {}) {
    if (typeof el.animate === 'function') {
      el.style.transform = `translateY(${toPct}%)`;
      const anim = el.animate(
        [
          { transform: `translateY(${fromPct}%)` },
          { transform: `translateY(${toPct}%)` },
        ],
        { duration, easing: SLIDE_EASING, fill: 'both' }
      );
      const finish = () => { if (onDone) onDone(); };
      if (anim.finished && typeof anim.finished.then === 'function') {
        anim.finished.then(finish, finish);
      } else {
        anim.onfinish = finish;
      }
      return;
    }
    // フォールバック（Web Animations API非対応の環境向け）。
    el.style.transition = 'none';
    el.style.transform = `translateY(${fromPct}%)`;
    void el.offsetWidth;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = `transform ${duration}ms ${SLIDE_EASING}`;
        el.style.transform = `translateY(${toPct}%)`;
      });
    });
    if (onDone) window.setTimeout(onDone, duration + 60);
  }

  function ensureOverlay() {
    let el = document.getElementById('pageTransitionMask');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pageTransitionMask';
      el.setAttribute('aria-hidden', 'true');
      el.style.position = 'fixed';
      el.style.inset = '0';
      el.style.zIndex = '99999';
      el.style.background = BG;
      el.style.pointerEvents = 'none';
      document.body.appendChild(el);
    }
    return el;
  }

  const api = {
    // 画面中央を中心に、指定した要素（実際のページの中身）を
    // 円0%→150%へクリップして「広がりながら現れる」ように見せる。
    // 行き（message-list.htmlへの入場）で使う。
    growReveal(el, onDone) {
      animateClip(el, 0, 150, { onDone });
    },

    // 画面全体を覆う単色オーバーレイを、円150%→0%へクリップして
    // 「中央に向かって閉じながら消える」ように見せる。すぼまるほど
    // 元々あったページの中身が現れる。帰り（index.htmlへの入場）で使う。
    shrinkOverlayAway(onDone) {
      const el = ensureOverlay();
      animateClip(el, 150, 0, {
        onDone: () => {
          el.remove();
          if (onDone) onDone();
        },
      });
    },

    // 画面全体を覆う単色オーバーレイ（既に画面いっぱいに広がっている
    // 状態＝PT-13サイトローダーが動いている間の見た目）を、
    // translateY(0)→translateY(-101%)で「そのまま上へ抜ける」ように
    // 見せる。X06（賑やかなページ遷移カタログ「カウンターが割り込む」）
    // のreveal。すぼまるshrinkOverlayAwayとは別の開き方。
    slideOverlayAway(onDone) {
      const el = ensureOverlay();
      animateSlide(el, 0, -101, {
        onDone: () => {
          el.remove();
          if (onDone) onDone();
        },
      });
    },

    // index.html側の先出し同期スクリプトが作ったオーバーレイ（既に
    // 画面全体を覆っている状態）を、本体側のensureOverlay()で
    // 再利用できるようにするための取得のみの関数。
    ensureOverlay,

    // 「message-list.htmlの『戻る』から来た」印をsessionStorageに残す。
    markReturn() {
      try { sessionStorage.setItem(RETURN_KEY, '1'); } catch (e) { /* ignore */ }
    },

    // 上の印を読み取って消費する（1回読んだら消える）。
    consumeReturn() {
      try {
        const v = sessionStorage.getItem(RETURN_KEY);
        sessionStorage.removeItem(RETURN_KEY);
        return v === '1';
      } catch (e) {
        return false;
      }
    },

    // ---- MEMORY下層ページ（memory-list.html）との行き来 ----
    // メッセージ一覧はサークルマスクだが、MEMORYは本人構想「トップページの
    // 写真が流れる空間に入り込む（ズームインする感じ）」「ズームアウトして
    // トップページに戻る」に合わせて、空間ごと拡大／縮小しながら背景色
    // （#282828、MEMORYと同じ）の暗幕で覆う／暗幕が晴れる動きにしている。

    // 「memory-list.htmlの『MEMORYに戻る』から来た」印。
    markReturnToMemory() {
      try { sessionStorage.setItem(MEMORY_RETURN_KEY, '1'); } catch (e) { /* ignore */ }
    },
    consumeReturnToMemory() {
      try {
        const v = sessionStorage.getItem(MEMORY_RETURN_KEY);
        sessionStorage.removeItem(MEMORY_RETURN_KEY);
        return v === '1';
      } catch (e) {
        return false;
      }
    },

    // 行き（index→memory-list）：targetを拡大しながら暗幕で覆い、覆い終えたら
    // onDoneを呼ぶ（呼び出し側がそこでページ遷移する）。originはtarget内の
    // 拡大の中心（CSSのtransform-origin形式、例 '40% 60%'）。
    zoomInCover(target, { origin = '50% 50%', toScale = 2.4, duration = 760, onDone } = {}) {
      const el = ensureOverlay();
      el.style.clipPath = 'none';
      el.style.background = MEMORY_BG;
      el.style.opacity = '0';
      const done = () => { if (onDone) onDone(); };
      if (typeof el.animate !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        el.style.opacity = '1';
        done();
        return;
      }
      target.style.transformOrigin = origin;
      target.animate(
        [{ transform: 'scale(1)' }, { transform: `scale(${toScale})` }],
        { duration, easing: 'cubic-bezier(.55,0,.75,.2)', fill: 'forwards' }
      );
      el.style.opacity = '1';
      const a = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing: 'cubic-bezier(.6,0,.9,.4)', fill: 'both' });
      a.finished.then(done, done);
    },

    // 帰り（memory-list→index）：画面を覆っている暗幕（冒頭の先出しの
    // オーバーレイ）を消しながら、targetを大きい状態から等倍へ縮めて
    // 「ズームアウトして戻ってきた」ように見せる。
    zoomOutReveal(target, { fromScale = 1.4, duration = 1000, onDone } = {}) {
      const el = ensureOverlay();
      el.style.clipPath = 'none';
      el.style.background = MEMORY_BG;
      const finish = () => {
        el.remove();
        target.style.transformOrigin = '';
        if (onDone) onDone();
      };
      if (typeof el.animate !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        finish();
        return;
      }
      target.style.transformOrigin = '50% 50%';
      const t = target.animate(
        [{ transform: `scale(${fromScale})` }, { transform: 'scale(1)' }],
        { duration, easing: 'cubic-bezier(.16,.84,.24,1)' }
      );
      el.style.opacity = '0';
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: duration * 0.7, easing: 'ease-out', fill: 'both' });
      t.finished.then(finish, finish);
    },
  };

  window.wlpPageTransition = api;
})();

/* ==========================================================
   ABOUT見出し

   1) 登場演出：サークルから見えた瞬間に1文字ずつ落ちて跳ねる（GSAP）
      参考: https://codehive.jp/animation-demo/text-split-animation の
      「Bounce（上から落ちてきて跳ねる）」を、1文字ずつtspanに分割して
      textPath上で再現。pager.jsが発火する'about:enter'
      （＝サークルが完全に開いて写真が見えた瞬間）をトリガーに1回だけ再生。
      textPath上のdy属性は「path方向に対して垂直」に動くため、
      ほぼ水平な弧の上では見た目上「上から落ちてくる」動きになる。

   2) 見出しの弧変形：スクロール量にそのまま連動（GSAP不使用）
      サークルが開き切った直後すぐ本文スクロールが始まると、冒頭の
      文章を読み切る前にスクロールし過ぎてしまうことがあるため、
      「サークルが開き切る→見出しが円弧に曲がる→本文が動き出す」の
      間に、見出しが弧を描く区間をワンクッション挟んでいる。
      このフェーズの間は本文(.about__text)のscrollTopをpager.js側で
      0に固定しているので、見出しが曲がっている間は文章が流れない。

      弧になる量(0〜1)はpager.jsがスクロール位置から計算し、
      window.aboutHeading.setBend(ratio) 経由で毎フレーム渡してくる。
      アニメーションのduration/easingを持たず、スクロール量に直接
      1:1で追従する（＝慣性スクロールの滑らかさがそのまま乗る）。
=========================================================== */
(() => {
  const headTextPath = document.querySelector('.about__arc-head textPath');
  const subTextPath = document.querySelector('.about__arc-sub textPath');
  const headPath = document.getElementById('aboutArcHead');
  const subPath = document.getElementById('aboutArcSub');
  if (!headTextPath || !subTextPath || !headPath || !subPath) return;

  /* ---------------- 2) 見出しの弧変形（スクロール直結） ---------------- */

  // 弧のコントロールポイントのy座標。flat=平ら、curve=曲がりきった状態。
  // x座標(426/1014, 530/910)はFigma実測に基づく固定値。
  const HEAD_CONTROL_Y = { flat: 132, curve: 33 };
  const SUB_CONTROL_Y = { flat: 170, curve: 102 };

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function applyHeadingBend(ratio) {
    const headY = lerp(HEAD_CONTROL_Y.flat, HEAD_CONTROL_Y.curve, ratio);
    const subY = lerp(SUB_CONTROL_Y.flat, SUB_CONTROL_Y.curve, ratio);
    headPath.setAttribute('d', `M 426,132 Q 720,${headY} 1014,132`);
    subPath.setAttribute('d', `M 530,170 Q 720,${subY} 910,170`);
  }

  // pager.jsから呼ばれる公開インターフェース。GSAPの有無やreduced-motion
  // に関わらず、スクロール位置に対して常に1:1で追従させる
  // （ユーザー自身のスクロール操作そのものなので、自動アニメーションを
  // 止めるreduced-motionの対象にはしていない）。
  window.aboutHeading = {
    setBend(ratio) {
      applyHeadingBend(Math.max(0, Math.min(1, ratio)));
    },
  };

  /* ---------------- 1) 登場演出：1文字ずつ落ちて跳ねる ---------------- */

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasGsap = typeof gsap !== 'undefined';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  // textContentを1文字ずつ<tspan>に分割する（textPathの上でも文字ごとの
  // 位置は自動でpathに沿って割り振られる）
  function splitToChars(textPathEl) {
    const str = textPathEl.textContent;
    textPathEl.textContent = '';
    return Array.from(str).map((ch) => {
      const tspan = document.createElementNS(SVG_NS, 'tspan');
      tspan.textContent = ch === ' ' ? ' ' : ch;
      textPathEl.appendChild(tspan);
      return tspan;
    });
  }

  const headChars = splitToChars(headTextPath);
  const subChars = splitToChars(subTextPath);
  const allChars = [...headChars, ...subChars];

  // pager.js側が見出しの高さ・位置を正確に測りたい時（フォント読み込み
  // 完了時の再計測など。詳細はpager.jsのremeasureAndPreserveScroll()
  // 呼び出し箇所のコメント参照）に使うヘルパー。登場演出が再生される
  // 前は文字が dy:-70・opacity:0（サークル上に落ちてくる前の隠れた
  // 状態）になっているため、この状態のままgetBoundingClientRect()で
  // 見出しのサイズを測ると、実際に表示される位置とはズレた値を拾って
  // しまう——それを避けるため、測定の瞬間だけ一時的にdy:0（本来の
  // 位置）へ戻してfn()を実行し、終わったら元の隠れた状態に戻す
  // （同期的に実行されるため、この間の状態変化が実際に描画されて
  // 見えることはない）。登場演出が既に再生済み、reduced-motion、
  // GSAP未読み込みのいずれかの場合は、そもそも文字は常に本来の位置に
  // いるのでそのままfn()を呼ぶだけでよい。
  window.aboutHeading.measureAtRest = function (fn) {
    if (!hasGsap || reduceMotion || hasPlayed) {
      return fn();
    }
    gsap.set(allChars, { attr: { dy: 0 }, opacity: 1 });
    const result = fn();
    gsap.set(allChars, { attr: { dy: -70 }, opacity: 0 });
    return result;
  };

  if (!hasGsap) {
    // GSAPが無い場合は最初から見えている状態のままにしておく（弧の変形は動く）
    return;
  }

  if (reduceMotion) {
    gsap.set(allChars, { attr: { dy: 0 }, opacity: 1 });
    return; // reduced-motionでは登場演出のみ行わない（弧の変形はスクロール追従のまま有効）
  }

  gsap.set(allChars, { attr: { dy: -70 }, opacity: 0 });

  let hasPlayed = false;
  function playIntro() {
    if (hasPlayed) return;
    hasPlayed = true;
    gsap
      .timeline()
      .to(headChars, {
        attr: { dy: 0 },
        opacity: 1,
        duration: 0.9,
        ease: 'bounce.out',
        stagger: 0.035,
      })
      .to(
        subChars,
        {
          attr: { dy: 0 },
          opacity: 1,
          duration: 0.7,
          ease: 'bounce.out',
          stagger: 0.02,
        },
        '-=0.5'
      );
  }

  // pager.jsが「ABOUTがサークルから見え始めた」タイミングで発火する
  window.addEventListener('about:enter', playIntro);
})();

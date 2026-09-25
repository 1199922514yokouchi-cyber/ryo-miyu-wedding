/* ==========================================================
   ファーストビューの登場演出＋マウスチルト。
   本人指示「画面が開いた瞬間に、奥のレイヤーから手前のレイヤーへと
   1枚ずつ順番に（時間差で）フワッと浮かび上がってファーストビューが
   完成し、その直後にマウスの動きに合わせた立体的なチルト効果（傾き）が
   有効化される仕様を作ります」。

   ▼レイヤー構成（index.htmlの.fv__layers。DOM順＝奥→手前）
     9：背景「HAPPY WEDDING」の文字の空間 / 8：右上の雲 / 7：花びら（小）
     6：奥の人物たち / 5：雲 / 4：「ご結婚おめでとうございます！」
     3：花びら（大） / 2：手前の人物たち / 1：手前の雲

   ▼登場（play）
   ローダー（site-loader.js）の幕が上がり始めるのと同時に、レイヤー9→1の
   順に STAGGER ずつ遅らせて、下から少し浮き上がりながら（translateY）
   わずかに大きさを戻しつつ（scale）フェードインさせる。最後のレイヤーが
   浮かび上がり終わった時点でファーストビューが完成し、チルトを有効化する。

   ▼チルト
   マウス位置（画面中央を0とした-1〜1）に合わせて、
     - レイヤー全体（.fv__layers）を少し回転（rotateX/rotateY、
       .fv__stageにperspectiveを設定）
     - 各レイヤーを奥行きに応じてずらす（奥のレイヤーほど小さく、
       手前のレイヤーほど大きく動く＝視差で立体に見える）
   の2つを重ねている。回転・ずらしでレイヤーの端が見えないよう、チルトが
   効き始める時だけレイヤー全体を4%だけ拡大する（有効化の瞬間に大きさが
   跳ねないよう、0.7秒かけて徐々に効かせる）。マウスの値はそのまま使わず
   毎フレーム少しずつ追いかける（ぬるっと傾く）。
   - ファーストビューが画面に見えている間（スクロール位置が先頭付近）だけ
     効かせ、スクロールして離れたら傾きを0へ戻して計算も止める。
   - マウスの無い端末（タッチ）、prefers-reduced-motion: reduce では
     登場演出もチルトも行わない（最初から完成した状態で表示）。
   - メッセージ／メモリーの下層ページから戻ってきた時など、ローダーを
     通らない表示では登場演出は行わない（最初から完成した状態）。
=========================================================== */
(() => {
  const stage = document.querySelector('#page-fv .fv__stage');
  const wrap = stage ? stage.querySelector('.fv__layers') : null;
  if (!stage || !wrap) return;
  const layers = [...wrap.querySelectorAll('.fv__layer')]; // DOM順＝奥(9)→手前(1)
  const n = layers.length;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  // 登場：レイヤー1枚ごとの時間差と、1枚が浮かび上がるのにかける時間
  const STAGGER = 170;   // ms
  const RISE = 1000;     // ms
  const RISE_EASE = 'cubic-bezier(.22,.9,.3,1)';
  // チルト：最大の回転角と、一番手前のレイヤーの最大移動量
  const MAX_ROT_X = 3.2;  // deg（上下の傾き）
  const MAX_ROT_Y = 4.5;  // deg（左右の傾き）
  const MAX_SHIFT = 26;   // px（手前のレイヤー。奥ほど小さく）
  const OVERSCAN = 0.04;  // チルト中にレイヤーの端が見えないための拡大率
  // 奥(0)→手前(1)の奥行き。背景の文字の空間はほとんど動かさない。
  const depth = layers.map((_, i) => (n > 1 ? 0.12 + (0.88 * i) / (n - 1) : 1));

  // ローダーを通る「初回の読み込み」のときだけ、最初からレイヤーを隠しておく。
  // （index.html冒頭の先出しオーバーレイで画面が覆われている間にこの
  //  スクリプトが実行されるので、隠す瞬間は見えない）
  let returnFromSub = false;
  try {
    returnFromSub = sessionStorage.getItem('wlpReturnToMessage') === '1'
      || sessionStorage.getItem('wlpReturnToMemory') === '1';
  } catch (e) { /* ignore */ }
  const useIntro = !reduceMotion && !returnFromSub && typeof layers[0].animate === 'function';
  if (useIntro) {
    layers.forEach((l) => { l.style.opacity = '0'; });
  }

  let played = false;
  function play() {
    if (played) return;
    played = true;
    if (!useIntro) { enableTilt(); return; }
    layers.forEach((l, i) => {
      l.style.willChange = 'transform, opacity';
      const a = l.animate(
        [
          { opacity: 0, transform: 'translate3d(0, 5vh, 0) scale(0.96)' },
          { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
        ],
        { duration: RISE, delay: i * STAGGER, easing: RISE_EASE, fill: 'backwards' }
      );
      l.style.opacity = '';
      if (i === n - 1) a.finished.then(enableTilt, enableTilt);
    });
  }

  // ---- チルト ----
  let tiltOn = false;
  const target = { x: 0, y: 0 };
  const cur = { x: 0, y: 0 };
  let engage = 0;       // 0→1：チルトの効き具合（有効化時にゆっくり上げる）
  let engageFrom = 0;
  let engageT0 = 0;
  let rafId = 0;

  function fvVisible() { return window.scrollY < window.innerHeight * 0.35; }

  function enableTilt() {
    if (tiltOn || reduceMotion || !canHover) return;
    tiltOn = true;
    stage.classList.add('is-tilting');
    engageFrom = 0;
    engageT0 = performance.now();
    layers.forEach((l) => { l.style.willChange = 'transform'; });
    request();
  }

  function request() { if (!rafId) rafId = requestAnimationFrame(tick); }

  function tick(now) {
    rafId = 0;
    const visible = fvVisible();
    const tx = visible ? target.x : 0;
    const ty = visible ? target.y : 0;
    cur.x += (tx - cur.x) * 0.075;
    cur.y += (ty - cur.y) * 0.075;
    engage = Math.min(1, engageFrom + (now - engageT0) / 700);
    const e = engage * engage * (3 - 2 * engage);
    const s = 1 + OVERSCAN * e;
    wrap.style.transform =
      `scale(${s.toFixed(4)}) rotateX(${(-cur.y * MAX_ROT_X * e).toFixed(3)}deg) rotateY(${(cur.x * MAX_ROT_Y * e).toFixed(3)}deg)`;
    layers.forEach((l, i) => {
      const d = depth[i] * e;
      l.style.transform = `translate3d(${(-cur.x * MAX_SHIFT * d).toFixed(2)}px, ${(-cur.y * MAX_SHIFT * 0.7 * d).toFixed(2)}px, 0)`;
    });
    const settling = Math.abs(tx - cur.x) > 0.001 || Math.abs(ty - cur.y) > 0.001 || engage < 1;
    if (settling) request();
  }

  window.addEventListener('pointermove', (e) => {
    if (!tiltOn || e.pointerType !== 'mouse') return;
    target.x = (e.clientX / window.innerWidth) * 2 - 1;
    target.y = (e.clientY / window.innerHeight) * 2 - 1;
    request();
  }, { passive: true });
  // マウスが画面外に出たら正面へ戻す
  document.addEventListener('mouseleave', () => { target.x = 0; target.y = 0; request(); });
  window.addEventListener('scroll', () => { if (tiltOn) request(); }, { passive: true });

  // ▼本人指摘「トップへ戻るボタン押した時も最初の一個づつ出てくる演出
  // できるようにできない？」への対応
  // play()は初回読み込み時に1回だけ再生する前提で`played`フラグにより
  // 二重実行を防いでいるため、そのままではTOPへ戻るボタン（下の方の
  // ページから戻ってくる時）で再度呼んでも何も起きない。かといって
  // フラグを外して単純にplay()を呼び直すだけだと、既に完成状態
  // （opacity:''=1相当）のレイヤーへ「0→1」のフェードインを上から
  // 重ねることになり、一瞬だけ全レイヤーが透けて見えてしまう。
  // そのため、初回のuseIntro判定はそのまま使い回しつつ、replay()では
  // 明示的にレイヤーを再度opacity:0へ戻してからplay()と同じ処理を
  // 呼び直す専用関数にした（reduced-motion環境やアニメーション非対応
  // 環境＝useIntro=falseの場合は、そもそも登場演出自体を行わない
  // 仕様に合わせてreplay()も何もしない）。
  function replay() {
    if (!useIntro) return;
    played = false;
    layers.forEach((l) => {
      l.getAnimations().forEach((a) => a.cancel()); // 前回のWeb Animationsが残っていれば止める
      l.style.opacity = '0';
      l.style.transform = '';
    });
    play();
  }

  // ローダーを通らない表示（下層ページから戻った時・reduced-motion等）でも
  // チルトだけは使えるよう、index.html末尾の処理が終わる頃に保険で有効化する。
  window.wlpFvIntro = {
    play,
    replay,
    skip() { played = true; layers.forEach((l) => { l.style.opacity = ''; }); enableTilt(); },
  };
})();

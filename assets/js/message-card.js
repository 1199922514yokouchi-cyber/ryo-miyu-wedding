/* ==========================================================
   MESSAGE：中央カードのマウス追従チルト演出（vanilla-tilt.js）＋
   クリック処理。

   カードの「回転しながら上から現れて正面中央で固定される」演出そのもの
   (NP-X18 リールが回って止まる) は pager.js のフェーズD
   (setMessageEnter()) が担当し、transform を毎フレーム書き換えている。
   このファイルは、その演出が完了して .message__card に is-settled が
   付いた"後"だけ、本人指定の vanilla-tilt.js
   （https://github.com/micku7zu/vanilla-tilt.js、CDN読み込みはindex.html
   側）でチルトを有効化する：
     - マウス位置に応じた3Dチルト
     - クリックハンドラ（下層ページ = メッセージ一覧はまだ未実装なので、
       ここではスタブのみ。本人からカンプが届き次第、遷移先をここに足す）

   「回転が止まった直後にチルトへ切り替わる部分を自然に」という指示に
   対応するため、VanillaTilt.init()は毎回ゼロから開始する（pager.js側が
   固定した瞬間にtransformを空文字へクリアしてから引き継ぐので、カードは
   既に正面・無回転の状態でチルトが始まる＝スナップやジャンプが起きない）。
   逆に、下へスクロールし直してカードが再び回転を始めた（is-settledが
   外れた）タイミングでは vanilla-tilt を破棄し、transformの制御を
   pager.js側へ返す（2箇所が同時にtransformを触るとちらつくため、
   常にどちらか一方だけが書き込む設計を維持している）。
=========================================================== */
(() => {
  const card = document.getElementById('messageCard');
  if (!card) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // vanilla-tilt.jsのオプション（本人共有のリファレンスに準拠）。
  // グレア（光の反射）は今回オフ：カードの角丸はメールアイコン画像側に
  // 焼き込まれているため、グレアを重ねるには別途クリップ用のラッパーが
  // 必要になり複雑化する。必要になれば glare:true, "max-glare":0.5 等を
  // 足せばよい。
  const TILT_OPTIONS = {
    max: 12,          // 最大傾き（度）
    speed: 400,        // 追従・復帰のアニメーション速度(ms)
    perspective: 900,   // vanilla-tilt独自のperspective（CSS側の.message__sceneとは別）
    scale: 1.03,        // ホバー時にわずかに拡大
    reset: true,        // マウスが離れたら正面姿勢に戻す
    'reset-to-start': true,
    'full-page-listening': false,
  };

  function isSettled() {
    return card.classList.contains('is-settled');
  }

  function enableTilt() {
    if (typeof window.VanillaTilt === 'undefined') return; // CDNが読めなかった場合は無効化するだけ
    if (card.vanillaTilt) return; // 二重初期化防止
    // pager.js側がis-settled付与と同時にtransformを空文字へクリアして
    // いるので、この時点でカードは既に正面（無回転）姿勢＝チルトは
    // ここからゼロベースで始まり、回転演出との継ぎ目が生じない。
    window.VanillaTilt.init(card, TILT_OPTIONS);
  }

  function disableTilt() {
    if (card.vanillaTilt) {
      card.vanillaTilt.destroy();
    }
    // vanilla-tilt destroy後にtransformが残るケースがあるため、
    // pager.js側へ制御を返す前に明示的にクリアしておく。
    card.style.transform = '';
  }

  if (!reduceMotion) {
    // is-settledの付け外しをMutationObserverで監視し、そのタイミングで
    // チルトの有効/無効を切り替える（pager.js側の実装を変更せずに
    // 疎結合で連携できる）。
    const observer = new MutationObserver(() => {
      if (isSettled()) {
        enableTilt();
      } else {
        disableTilt();
      }
    });
    observer.observe(card, { attributes: true, attributeFilter: ['class'] });

    // スクリプト読み込み時点で既に固定済み（reduced-motion等の理由で
    // 初期描画からis-settledが付いている場合）にも対応しておく。
    if (isSettled()) enableTilt();
  }

  // クリック（回転中はpointer-events:noneで物理的にクリックできないため、
  // ここでのisSettled()チェックは二重の安全策）。
  // 下層ページ（メッセージ一覧、message-list.html）へ遷移する。
  // 「広がる円で見せる」演出そのものは遷移先（message-list.html）側が
  // 担当するので、ここでは即座に遷移するだけでよい
  // （assets/js/page-transition.js、本人指示：「広がって閉じて飛ぶ」の
  // ではなく「広がって表示される」の一動作にする）。
  function handleActivate() {
    if (!isSettled()) return;
    window.location.href = 'message-list.html';
  }

  card.addEventListener('click', handleActivate);
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleActivate();
    }
  });
})();

/* ==========================================================
   最後のページ（TO BE CONTINUEDシーン）右下の「TOPへ戻る」ボタン。
   本人指示：「最後のページの右下あたりにトップへ戻るボタンを置きたい」。

   ▼本人フィードバック「トップに戻る時に全部のページをみながら戻ってる
   感じ」「押した瞬間戻るのも変だからロード入れるとかいいかも」への対応
   当初はscrollTo({behavior:'smooth'})でscrollY=0へ直接スムーズ
   スクロールしていたが、この方式だとFVから最後のページまでの
   全セクションを高速に巻き戻りながら通過する画面になってしまい、
   「全部のページを見ながら戻ってる」不自然な見た目になっていた。

   そこで、index.html⇄message-list.html間の遷移で既に使っている
   「画面中央から円が広がる/すぼまるサークルマスク」
   （assets/js/page-transition.js）を、ページ内スクロールにも流用する
   方式に変更した：
     1. 画面中央から単色オーバーレイの円が広がり、画面全体を覆う
        （page-transition.jsのgrowReveal()。本来は「中身が現れる」
        演出だが、対象をオーバーレイ側にすることで「覆う」演出として
        流用している＝円0%→150%という動き自体は同じ）
     2. 完全に覆われた瞬間（＝ユーザーからは見えない）にscrollTopを
        即座に0へジャンプさせる。覆われている間の移動なので、
        中間のセクションが見える心配がない
     3. オーバーレイが消えて、TOP（FV）が現れる（当初は
        shrinkOverlayAway()＝message-list.htmlから戻る時と同じ
        「すぼまって明らかになる」動きだったが、後述のX06対応で
        slideOverlayAway()＝「幕がそのまま上へスライドして抜ける」
        動きに差し替えている）
   これにより「ボタンを押す→一瞬色画面を挟む（＝簡易的なロード感）→
   TOPが現れる」という、本人の要望どおりの自然な体感になる。

   ▼さらに、上記だけでは不十分だった点への追加対応
   window.scrollTo()で実際のスクロール位置(scrollY)は一瞬で0になっても、
   pager.js側には「window.scrollYを目標値、progress.currentを実際の
   描画に使う値として、指数関数で少し遅れて追従させる」仕組みが別に
   ある（assets/js/pager.js内のtick()）。これはスクロール自体を
   なめらかに見せるためのものだが、瞬間ジャンプの場合は逆に「実際の
   スクロール位置は既に0なのに、描画だけが末尾から0まで数百ms〜1秒
   以上かけて全フェーズを巻き戻りながら遅れて追いつく」という、
   まさに本人指摘の「全部のページをみながら戻ってる感じ」の直接の
   原因になっていた（オーバーレイでどれだけ覆っていても、この遅延
   追従じたいはオーバーレイの下で起き続け、すぼまった時にまだ
   追いついていない途中のフェーズが一瞬見えてしまう）。
   下層ページ（message-list.html）から「MESSAGEに戻る」で着地する際に
   既に同じ問題への対処として`pager.js`に`window.__scrollToMessageRestY`
   （scrollTo()と同時にprogress.currentも即座に同期させる関数）が
   用意されていたので、同じパターンでTOP（scrollY=0）用の
   `window.__scrollToTopInstant`を追加し、ここではそれを使う。
   page-transition.js／pager.jsの該当関数が未読込／
   prefers-reduced-motionの環境では、従来どおりのシンプルな
   scrollTo()にフォールバックする。

   ▼本人指示「トップ戻る時は今マスク演出追加してくれてるけど、マスクで
   覆ったあと、ファーストビューの前にローダーを入れる予定だからそこに
   繋がるようにしたい」への対応
   サイトを開いた瞬間用に実装したPT-13ローダー（assets/js/
   site-loader.js）を、上記2.のタイミング（オーバーレイに完全に
   覆われた直後）に挟み込んだ。ローダーのonMidpoint（カウントアップが
   100に達し、裏側のページを差し替えた直後＝まだ画面は完全に覆われた
   まま）でscrollToTopInstant()を呼ぶことで、スクロールジャンプ自体は
   これまでどおりユーザーから完全に見えないまま実行される。結果として
   「①覆う（既存のgrowReveal）→②ロード中（カウントアップ＋進捗バー、
   この間にスクロールジャンプ）→③幕が開く」という、サイト読み込み時と
   全く同じ語彙の一続きの演出になる。site-loader.js未読込の環境では、
   ローダーを飛ばして従来どおり即座にジャンプ＋幕開けする。
   ③の「幕が開く」の中身（shrinkOverlayAway→slideOverlayAway）は
   下記のX06対応を参照。

   ▼本人指示「トップに戻る時のマスクは黄色じゃなくてロードの時の背景と
   同じ黒でいいよ」への対応
   page-transition.jsのensureOverlay()は新規作成時デフォルトで黄色
   グラデーション（message-list.htmlとの行き来で使う色）を敷くが、
   TOPへ戻るボタンではそれを使わず、覆う前に明示的に黒(--ink)へ
   差し替えている。これにより「覆う（黒）→ローダー（黒のまま、
   site-loader.js側で背景を変更しない）→幕が開く（黒がすぼまる）」と
   一貫して黒になり、ロード演出の黒と色が途切れず繋がる
   （message-list.htmlとの行き来の黄色マスクは従来どおり別物として
   維持）。

   ▼本人指摘「トップへ戻るボタン押した時も最初の一個づつ出てくる演出
   できるようにできない？」への対応
   サイトを開いた瞬間だけの演出だったFVの「奥→手前に1枚ずつフワッと
   浮かび上がる」登場演出(assets/js/fv-intro.js)を、TOPへ戻るボタンでも
   同じタイミング（幕が開き始める瞬間）で再生するようにした。fv-intro.js
   側の通常のplay()は「初回読み込みで1回だけ」という前提で二重実行防止の
   フラグを持っているため、そのままでは2回目以降は何も起きない。
   fv-intro.js側に専用のreplay()（いったんレイヤーを非表示へ戻してから
   同じ演出を流し直す関数）を追加し、ここではそれを呼ぶ。 */
(() => {
  const btn = document.getElementById('tbcTopBtn');
  if (!btn) return;

  // site-loader.js（PT-13ローダー）の黒(--ink)と同じ値。ローダー本体は
  // assets/js/site-loader.js側の定数として持っているが、こちらは
  // ローダーを起動する「前」にオーバーレイの初期背景を黒にしたいだけ
  // なので、値をここでも直接持っている（page-transition.js側の黄色
  // BGも同様に複数箇所で値を直接持つ既存方針に合わせている）。
  const LOADER_INK = '#282828';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function fallbackScroll() {
    window.scrollTo({ top: 0, left: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  btn.addEventListener('click', () => {
    if (btn.disabled) return; // アニメーション中の連打を防ぐ

    if (reduceMotion || !window.wlpPageTransition) {
      fallbackScroll();
      return;
    }

    btn.disabled = true;
    const overlay = window.wlpPageTransition.ensureOverlay();
    // 覆い始める前に背景を黒へ差し替える（本人指示：黄色ではなく
    // ロードの時の背景と同じ黒でいい）。ensureOverlay()が新規作成時に
    // 敷くデフォルトの黄色グラデーションを、ここで上書きする。
    overlay.style.background = LOADER_INK;

    function jumpToTopInstant() {
      // pager.js側の内部状態(progress.current)も同時に同期させることで、
      // オーバーレイが開いた瞬間に「まだ追いついていない途中のフェーズ」
      // が見えてしまう問題を防ぐ（window.__scrollToTopInstant参照）。
      if (typeof window.__scrollToTopInstant === 'function') {
        window.__scrollToTopInstant();
      } else {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      }
    }

    window.wlpPageTransition.growReveal(overlay, () => {
      // オーバーレイに完全に覆われた状態。ここでPT-13ローダー
      // （カウントアップ→ホワイトフラッシュ）を挟み、フラッシュで
      // 画面が白い間（＝ユーザーには見えない）にスクロールジャンプを
      // 行う。site-loader.js未読込の場合は従来どおり即座にジャンプする。
      if (window.wlpSiteLoader) {
        window.wlpSiteLoader.run(overlay, {
          reduceMotion,
          onMidpoint: jumpToTopInstant,
          onDone: () => {
            // 本人指示「マスクが縮小してファーストビューじゃなくて
            // 賑やかなページ遷移のX06カウンターが割り込むを適用したい」
            // への対応：④の「幕が開く」を、すぼまるshrinkOverlayAway()
            // からX06と同じ「幕がそのまま上へスライドして抜ける」
            // slideOverlayAway()に差し替えた。
            window.wlpPageTransition.slideOverlayAway(() => {
              btn.disabled = false;
            });
            // 本人指摘「トップへ戻るボタン押した時も最初の一個づつ出てくる
            // 演出できるようにできない？」への対応：サイト初回読み込み時
            // （revealFreshLoad）と同じく、幕が開き始めるのと同時にFVの
            // 「奥→手前に1枚ずつ浮かび上がる」演出(fv-intro.js)を
            // 再生する。通常のplay()は初回1回きりなので、専用の
            // replay()（いったんレイヤーを隠してから同じ演出を流す）を使う。
            if (window.wlpFvIntro && window.wlpFvIntro.replay) window.wlpFvIntro.replay();
          },
        });
      } else {
        jumpToTopInstant();
        window.wlpPageTransition.slideOverlayAway(() => {
          btn.disabled = false;
        });
        if (window.wlpFvIntro && window.wlpFvIntro.replay) window.wlpFvIntro.replay();
      }
    });
  });
})();

/* ==========================================================
   PT-13：サイトローダー（サイトを開いた瞬間の「①ロード中→②ロード
   終わる→③幕が開く」演出）のカウントアップ／進捗バー制御。

   本人から「ロード/ロード終わる/幕が開く こんな感じにしたいんだけど
   どんなアニメーションパターンがある？これもカタログ化して欲しい」と
   依頼され、6パターン（A〜F）の比較カタログを別途お送りしたところ、
   本人が「C（カウントアップ→ホワイトフラッシュ）でお願い」と選んだ
   ものをいったん実装していた。

   ▼「マスクが縮小してファーストビューじゃなくて賑やかなページ遷移の
   X06カウンターが割り込むを適用したい」への対応
   本人から「Interaction_Index.html」（賑やかなページ遷移カタログ、
   18パターン）の実ファイルを共有してもらい、その中の
   「X06：カウンターが割り込む（VEIL）」を確認した。実物の構成は：
     ①黒い幕が下からスライドインして画面を覆う
     ②0→100のカウントアップと同時に、幕の下端を横断する
       進捗バーが0%→100%へ伸びる（linear、カウントと同じ長さ）
     ③カウントが100に達したら、裏側のページを即座に次へ差し替え
     ④少し間を置いてから、幕はそのまま上へスライドして抜ける
       （＝サークルマスクのように「すぼまる」のではなく、
       スライドで通り過ぎていく開き方）
   白フラッシュや数字の弾む演出（旧C案）は無い。

   このモジュールは単独では「画面を覆う」動きを持たない。呼び出し側が
   既に（PT-09サークルマスクのgrowRevealなどで）画面全体を黒く覆った
   状態のオーバーレイ要素を渡してくれる前提で、その中に②のカウント
   アップ＋進捗バーだけを再生する——①の「覆う」と④の「幕が開く」は
   呼び出し側の役割のまま（④は今回、shrinkOverlayAway()から
   slideOverlayAway()＝X06と同じスライド抜けに差し替えた）。これにより、
     - サイトを開いた瞬間（index.html読み込み時）：最初から画面を
       覆った状態で読み込み、ローダー再生→幕がスライドして抜けてFVが
       現れる
     - TOPへ戻るボタン：growReveal()で覆う→ローダー再生→（覆われて
       いる間にスクロールを0へジャンプ）→幕がスライドして抜けてFVが
       現れる
   の両方を、同じローダー・同じ「幕」の語彙で自然につなげられる。

   使い方：
     window.wlpSiteLoader.run(overlayEl, {
       reduceMotion,      // trueならアニメーションなしで即座に終わる
       onMidpoint,        // カウントアップが100に達し、裏のページを
                           // 次へ差し替えた直後＝画面がまだ完全に
                           // 覆われている間に呼ばれる（スクロール
                           // ジャンプ等、見せたくない処理を仕込む場所）
       onDone,            // ここで呼び出し側がslideOverlayAway()を
                           // 呼んで実際に幕を開ける
     });
=========================================================== */
(() => {
  const COUNT_DURATION = 1300; // ms：0→100のカウントアップ／進捗バーの時間
  // ms：カウント完了→ページ差し替え後、幕を開け始めるまでの間。
  // 元はX06と同じ160msだったが、本人指示「最初のロードが100になったあと
  // すぐに開くアニメーションになってるけど、1秒くらい『ための時間』が
  // 欲しい」を受けて1000msに延長（100%の表示のまま約1秒静止してから
  // 幕が上がる）。
  const SETTLE_DELAY = 1000;

  function run(overlayEl, options = {}) {
    const { onMidpoint, onDone, reduceMotion } = options;

    if (reduceMotion || !overlayEl || typeof overlayEl.appendChild !== 'function') {
      if (onMidpoint) onMidpoint();
      if (onDone) onDone();
      return;
    }

    const inner = document.createElement('div');
    inner.className = 'site-loader__inner';
    inner.setAttribute('aria-hidden', 'true');

    const numEl = document.createElement('span');
    numEl.className = 'site-loader__num';
    numEl.textContent = '0';
    inner.appendChild(numEl);

    const barEl = document.createElement('div');
    barEl.className = 'site-loader__bar';

    overlayEl.appendChild(inner);
    overlayEl.appendChild(barEl);

    const start = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - start) / COUNT_DURATION);
      numEl.textContent = String(Math.round(t * 100));
      barEl.style.width = (t * 100) + '%';
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        finishCounting();
      }
    }

    let finished = false;
    function finishCounting() {
      if (finished) return;
      finished = true;
      // カウントが100に達した瞬間、裏のページを次へ差し替える
      // （画面はまだ覆われたまま＝ここでonMidpointを呼ぶ）。
      if (onMidpoint) onMidpoint();
      window.setTimeout(() => {
        // 後片付け（ローダーUIを外す）をしてから、呼び出し側に
        // 「幕を開けていい」タイミングを渡す。
        inner.remove();
        barEl.remove();
        if (onDone) onDone();
      }, SETTLE_DELAY);
    }

    requestAnimationFrame(tick);
  }

  window.wlpSiteLoader = { run };
})();

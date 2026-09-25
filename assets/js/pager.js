/* ==========================================================
   ページャー本体（現状：1.FV ⇔ 2.ABOUT の1組のみ）

   仕組みは「本物の縦長ドキュメント + position:fixed のページ + window の
   scrollイベント」というシンプルな構成：
   - .scroll-stage の高さをJSで実測に応じて設定し、そのぶんbodyが
     縦にスクロール可能になる
   - .scroll-stage__pin は position:fixed で常に画面いっぱいに貼りつく
   - window.scrollY を「目標値」として、そこへ時間ベースの指数関数で
     滑らかに追従する値（PROGRESS.current）を毎フレーム計算し、
     PT-09（サークルマスク）の半径・本文のscrollTop・見出しの位置は
     すべてその追従値から算出する（参考: codepen.io/gjcod/pen/YzLWVWN の
     GSAP ScrollTrigger `scrub` と同じ「少し遅れてついてくる」感触を、
     GSAP/ScrollTriggerを追加せず素のrequestAnimationFrameで再現）。

   ホイール／スワイプ／矢印キー／スペースキーは、すべてブラウザ標準の
   スクロール挙動に任せる。preventDefaultも独自のイベントハンドラも不要。

   スクロールは以下の3フェーズに分かれる（追従後のスクロール量の区間で
   連続的に決まる）：
     フェーズA（0 〜 revealDist）: FVの上にABOUTがサークルマスクで
       広がっていく。中心位置はトンネル/写真の視覚的な中心
       （画面中央よりわずかに下）に合わせている。
     フェーズA2（revealDist 〜 revealDist+bendDist）: サークルは開き
       切った状態で、見出し（ABOUT／このページについて）がスクロール量
       に応じて円弧に曲がっていく。このフェーズの間、本文
       (.about__text)のscrollTopは0に固定していて動かない＝
       「サークルが開き切る→見出しが曲がる→本文が動き出す」という
       一連の流れをワンクッション挟むことで、開き切った直後の勢いの
       ままスクロールして冒頭の文章を読み飛ばしてしまうのを防ぐ。
     フェーズB（revealDist+bendDist 〜 revealDist+bendDist+textDist）:
       本文だけが内部スクロールする。最初の行はフェーズA2終了時点で
       画面中央、最後の行もスクロールし切ると画面中央で止まる
       （本文側のpadding-top/bottomで担保）。
   以前は最後に1画面ぶんの余白（restDist）を足していたが、開き切った
   後も何も起きないままさらにスクロールし続けられて「終わった感じが
   しない」不具合の原因になっていたため廃止（現在はrestDist=0）。
   将来ページを増やす際は、そのページぶんの実質的なフェーズ距離を
   足す形にすること（単なる空の余白としては足さない）。

   どのフェーズも「スクロール量の区間→そのフェーズの中での比率(0〜1)」
   という同じ形の計算をしているだけなので、慣性スクロール（下記の
   スクラブ追従）に乗せれば自動的に全フェーズがシームレスに繋がる。

   ABOUT／このページについての見出し（.about__arc-text）は「本文の一番上の
   行」として扱う：フェーズA終了時点（本文スクロール前）は静止し、
   フェーズBでは本文とまったく同じ量だけ一緒に上へ動いていく。位置は
   CSS変数 --about-heading-shift 経由で反映する。静止時の位置は
   「見出し下端と本文1行目上端の間にGAP_PXぶんの隙間ができる位置」を
   実測から逆算している（本文が見出しと重なるのを防ぐため）。
=========================================================== */
/* 追記：3ページ目 MEMORY を追加。フェーズB（本文スクロール）の後ろに
   フェーズC（ABOUT→MEMORYへの切り替え）を継ぎ足した。仕組みはフェーズ
   A〜Bとまったく同じ「スクロール量の区間→そのフェーズの中での比率
   (0〜1)」。ABOUTは指示により固定のまま動かさず、MEMORYのフレームだけを
   画面左下の外側から右上（定位置）へtranslateで動かして、スクロールに
   連動してABOUTの上に重なるように現れさせている。 */
(() => {
  const scrollStage = document.getElementById('scrollStage');
  const fvPage = document.getElementById('page-fv');
  const aboutPage = document.getElementById('page-about');
  if (!scrollStage || !fvPage || !aboutPage) return;

  const aboutFrame = aboutPage.querySelector('.page__frame');
  const aboutStage = aboutPage.querySelector('.about__stage');
  const aboutTextEl = aboutPage.querySelector('.about__text');
  const headingSubEl = aboutPage.querySelector('.about__arc-sub');

  // MEMORY（3ページ目）。まだ後続ページが無い環境向けに、無くても
  // 落ちないようオプショナル扱いにしておく（nullなら該当処理はスキップ）。
  const memoryPage = document.getElementById('page-memory');
  const memoryFrame = memoryPage ? memoryPage.querySelector('.page__frame') : null;
  const memoryCanvas = memoryPage ? memoryPage.querySelector('.memory__canvas') : null;

  // MESSAGE（4ページ目）。まだ後続ページが無い環境向けに、無くても
  // 落ちないようオプショナル扱いにしておく（nullなら該当処理はスキップ）。
  const messagePage = document.getElementById('page-message');
  const messageStage = messagePage ? messagePage.querySelector('.message__stage') : null;
  const messageCard = messagePage ? messagePage.querySelector('#messageCard') : null;

  // Q&A（5ページ目）。実体（登場演出・カード送り）はassets/js/qa.jsが
  // window.qaSectionとして公開しており、pager.jsからはそこへratioを
  // 渡すだけ。qa.htmlは無くても落ちないようオプショナル扱い。
  const qaPage = document.getElementById('page-qa');

  // FROM ME（6ページ目）。Q&Aを読み終えた後の締めくくりページ。
  const fromMePage = document.getElementById('page-from-me');
  const fromMeStage = fromMePage ? fromMePage.querySelector('.from-me__stage') : null;

  // TO BE CONTINUED・文字のみ（7ページ目）。FROM MEからPT-07
  // （ズーム＋フェード）で切り替わる中継ページ。
  const tbcTextPage = document.getElementById('page-tbc-text');
  const tbcTextEl = tbcTextPage ? tbcTextPage.querySelector('.tbc-text') : null;
  const tbcTextPanelL = tbcTextPage ? tbcTextPage.querySelector('.tbc-text__panel--l') : null;
  const tbcTextPanelR = tbcTextPage ? tbcTextPage.querySelector('.tbc-text__panel--r') : null;

  // TO BE CONTINUED・画像シーン（8ページ目、サイト最後のページ）。
  // 7ページ目からPT-12（スプリット）で切り替わる。
  const tbcScenePage = document.getElementById('page-tbc-scene');
  // 背景（星雲が漂うループ動画。本人から添付された動画に差し替え済み。
  // 詳細はindex.html側のPAGE 8コメント参照）。FROM MEの背景動画と同じく
  // 「is-activeの間だけ再生」方式にする（setTbcSceneActive()参照）。
  const tbcSceneVideo = document.getElementById('tbcSceneVideo');

  // パララックス対象：各写真/動画カードのdata-depth属性（奥行き係数）を
  // 起動時に読んでおく。1より大きいほど手前で速く、小さいほど奥で
  // ゆっくり動く（setMemoryPan()が毎フレーム、キャンバス本体のパン量に
  // この係数ぶんの追加オフセットを掛けて各要素へ与える）。
  const memoryParallaxItems = memoryCanvas
    ? Array.from(memoryCanvas.querySelectorAll('.memory__photo')).map((el) => ({
        el,
        depth: parseFloat(el.dataset.depth) || 1,
      }))
    : [];

  /* ==========================================================
     定数
  =========================================================== */

  // サークルが広がる中心。画面下端を中心にすることで「下端から半円が
  // せり上がってくる」ような広がり方にしている（中心が画面内にあると
  // 戻る時の収束が不自然に見えるため、中心自体を画面の外＝下端に
  // 逃がしている）。
  const CENTER_X = '50%';
  const CENTER_Y = '100%';

  // 見出し（このページについて、の下端）と本文1行目の上端の間に
  // 空ける実ピクセルの隙間。
  const GAP_PX = 32;

  // フェーズA2（見出しが弧に曲がる）の長さ。画面何画面ぶんのスクロールで
  // 曲がり切るか。大きいほど「ワンクッション」が長く、ゆったりする。
  const BEND_SCREENS = 0.6;

  // スクロール位置に追従する速さ（秒）。小さいほどキビキビ、
  // 大きいほど「遅れてついてくる」滑らかな追従になる。
  // 参考コードのGSAP ScrollTrigger `scrub: 1`（約1秒で追従）に近い値。
  //
  // ※一時0.9まで上げたことがあるが、本人から「ちょっと重くなった
  // みたいで嫌だな」と指摘があり0.45へ差し戻し済み。「一気にスクロール
  // した時にサークルの広がり等が一瞬で通り過ぎる」件はこの値では
  // 対応せず、別の方法（各フェーズの距離自体を調整するなど）を
  // 改めて検討すること。
  const SCRUB_SECONDS = 0.45;

  // 追従がこの誤差(px)以下になったらrAFループを止める
  const SETTLE_EPSILON = 0.5;

  // フェーズB（本文スクロール）のイージング。生のスクロール量(0〜1)を
  // そのまま本文の移動量にはせず、この指数で加速させたカーブに通す。
  // 「文字がアクティブにならないと本文が上に流れない」ようにしたいので、
  // 序盤（アクティブになる文字が少ない間）はほとんど動かず、本文の半分を
  // 超えたあたりから徐々にスムーズに流れ出す（値が大きいほど序盤が長く
  // 停滞し、終盤の加速が急になる。2〜4あたりが自然。3=立方イージング）。
  const TEXT_SCROLL_EASE_POWER = 3;

  // フェーズB全体の「遅さ」。本人の感覚で「今の速さを10としたら理想は3」
  // という指定を、そのままスクロール距離の倍率にしている
  // （10/3倍のスクロール量をかけないと本文を読み終わらない＝
  // 体感速度はおよそ3/10になる）。大きくするほど、同じ本文を読み切る
  // のに必要な物理的なスクロール量が増えてゆっくりになる。
  const TEXT_SCROLL_SLOWDOWN = 10 / 3;

  // フェーズC1（MEMORYが画面左から水平にスライドインしてABOUTに重なる）
  // の長さ。画面何画面ぶんのスクロールで完全に重なり切るか。
  const MEMORY_ENTER_SCREENS = 0.8;

  // フェーズC1の入り始めに「減速」を足すためのイージング指数。
  // スクロール量と移動量を単純比例(1:1)にせず、比率をこの指数で
  // べき乗してから使う＝スクロールし始めの序盤（画面左から出てくる
  // あたり）だけ移動量が控えめになり、中間を過ぎるあたりからは
  // ほぼ通常のペースに追いついて右端（定位置）まで辿り着く
  // （フェーズB本文スクロールで使っているTEXT_SCROLL_EASE_POWERと
  // 同じ考え方）。1にすると通常の等速に戻る。大きいほど「最初の
  // もたつき」が強くなる（1.4〜2.2あたりが自然）。
  // なお、この後のフェーズC2（キャンバスのパン）のスクラブ追従による
  // 減速感はこのままで良いとのことなので、ここでは変更しない。
  const MEMORY_ENTER_EASE_POWER = 2;

  // フェーズC2（重なった後、キャンバスが左へパンして写真を右へ右へと
  // 流していく）の「遅さ」。実際にパンする必要のある物理ピクセル量
  // (canvasの実測幅 − ビューポート幅)に対して、この倍率ぶん余分に
  // スクロールしないとパンし切らないようにしている（数値が大きいほど
  // ゆっくり流れる。1なら「スクロール量＝そのままパン量」の直感的な速さ）。
  const MEMORY_PAN_SLOWDOWN = 1;

  // フェーズD（MEMORY→MESSAGE、NP-X18「リールが回って止まる」）の長さ。
  // 画面何画面ぶんのスクロールで「背景タイルが下から登り切って固定される
  // ＋中央カードが上から回転しながら現れて正面中央で止まる」が完了するか。
  // 大きいほどスピンがゆったり長く、小さいほど一気に決まる。
  const MESSAGE_ENTER_SCREENS = 1.4;

  // 中央カードの「リール」演出。ratio(0〜1、背景の登り切り具合と同じ値)を
  // 使って、カードがratio=0でこの回転数ぶん奥にいる状態からratio=1で
  // ちょうど0度(正面)に決まるところまでを、二乗イージング
  // (Math.pow(1-ratio,2))で減速させながら回す＝スロットのリールが
  // 徐々に減速して止まる感触（元は3回転だったが、本人指示により
  // 2回転ぶん減らして1回転にした）。
  const MESSAGE_CARD_SPIN_TURNS = 1;

  // カードが上から現れてくる距離（vw）。ratio=0でこの分だけ上（画面外）に
  // いて、ratio=1で0（定位置）に収まる。
  const MESSAGE_CARD_RISE_VW = 46;

  // カードのフェードイン：ratioがこの値に達するまでの間だけopacityを
  // 0→1にする（それ以降は不透明のまま回転が続く）。あまり早いと
  // 「棒立ちで回っている」ように見えるため、序盤だけに絞っている。
  const MESSAGE_CARD_FADE_RATIO = 0.22;

  // 本人指示：「メッセージのセクションが7割くらい画面内に表示されたら
  // 中央のアイコンに触れるようにしたい」。以前は背景・見出しを含む
  // MESSAGEセクション全体の入場が完全に終わる(ratio>=1)まで中央カードの
  // 回転演出が続き、そこで初めてis-settledが付いてクリック／チルトが
  // 有効になっていた。ここを「セクションの入場が7割まで進んだ時点」で
  // 前倒しするため、カード自身の回転・フェード・浮き上がり演出だけを
  // このratio（0〜1のうちの割合）で完了させ、その時点でis-settledを
  // 付与する。セクション全体(.message__stage)側のtranslateYは従来どおり
  // ratio=1まで連続して動き続ける（＝カードが先に静止・操作可能になった
  // 後も、背景や見出しは残り3割ぶん引き続きせり上がってくる）。
  //
  // ※その後の本人指示「メッセージのトップページのアイコンの登場演出だけど、
  // 周りながらにプラスして、拡大しながらの方がいいかなと思う。そしたら、
  // 最初の方は触れないってわかる。今の1/3のサイズから徐々に回りながら
  // 大きくなってセクションの画面が9割見えたくらいで中央に固定される感じに
  // したい」を受けて、7割→9割に変更（あわせて下のMESSAGE_CARD_START_SCALE
  // による拡大を追加）。
  const MESSAGE_CARD_SETTLE_RATIO = 0.9;

  // カードの登場時の大きさ（最終サイズに対する倍率）。本人指示「今の1/3の
  // サイズから徐々に回りながら大きくなって」。回転・降下と同じ減速カーブで
  // 1/3→1へ拡大し、MESSAGE_CARD_SETTLE_RATIOの時点でちょうど等倍になって
  // 固定（is-settled）される。小さいうちは「まだ触れない」ことが見た目で
  // 伝わる（固定されるまではクリック・チルトも無効のまま）。
  const MESSAGE_CARD_START_SCALE = 1 / 3;

  // フェーズE1（MESSAGE→QA、プッシュ型の押し出し切り替え）の長さ。
  // 画面何画面ぶんのスクロールでMESSAGEが画面上へ抜け切り、QAが
  // 定位置に収まるか。MEMORY→MESSAGEのMESSAGE_ENTER_SCREENSと同じ
  // 考え方（ただし今回はリール演出などの副演出が無いぶん、少し短め）。
  const QA_ENTER_SCREENS = 1.0;

  // フェーズE2（QAのカード送り）で、1問ぶんに割り当てるスクロール距離
  // （画面何画面ぶんか）。大きいほど1問をじっくり読める代わりに
  // 全体が長くなる。
  const QA_CARD_SCREENS = 0.9;

  // フェーズF（Q&A→FROM ME）の長さ。Q&Aを上へ押し出しながら、
  // FROM MEを下から静かに入れ替えるための距離。
  const FROM_ME_ENTER_SCREENS = 1.0;

  // フェーズF2（FROM MEで「立ち止まる」ための静止区間）の長さ。
  // ※本人指摘「from meから文字だけセクションに切り替わるところが、
  // 一瞬なのでfrom meのセクションで立ち止まれる用に設計していきたい」
  // への対応。以前はフェーズF（QA→FROM MEのアイリス）が終わった
  // その瞬間（FROM MEが定位置に収まった直後の1px）から、間を置かず
  // 次のフェーズG（FROM ME→TBC文字のズーム＋フェード）が始まって
  // いたため、FROM MEをじっくり見る「間」がスクロール距離として
  // 一切確保されていなかった（＝「一瞬で切り替わる」ように感じる
  // 原因）。ここでは何も演出を足さず、FROM MEが定位置のまま・
  // TBC文字ページも完全に不可視のまま、という状態を保つだけの
  // 「素通りできない滞在区間」をスクロール距離として挟んでいる
  // （「単にスクロールの減速をかける」という案と実質的には同じ
  // 効果を、この設計の他のワンクッション—ABOUTのBEND_SCREENSなど—
  // と同じ「区間を足す」やり方で実現したもの）。
  const FROM_ME_REST_SCREENS = 0.9;

  // フェーズG（FROM ME→TO BE CONTINUED文字ページ、PT-07「ズーム＋
  // フェード」）の長さ。
  const TBC_TEXT_ENTER_SCREENS = 0.8;

  // フェーズG2（TBC文字ページで「立ち止まる」ための静止区間）の長さ。
  // ※本人指摘「文字だけセクションでフェードインしてから二つに割れて
  // 開かれるまでが一瞬すぎるかな。割れる前に少しスクロールに余裕を
  // 持たせたい」への対応。FROM_ME_REST_SCREENSとまったく同じ考え方
  // （何も動かさず、この区間ぶんのスクロールを「消化」しないと次の
  // フェーズ（PT-12スプリット）へ進めないようにするだけ）。
  const TBC_TEXT_REST_SCREENS = 0.8;

  // フェーズH（TO BE CONTINUED文字ページ→画像シーンページ、PT-12
  // 「スプリット」）の長さ。
  const TBC_SPLIT_SCREENS = 0.8;

  // qa.js側のitems配列の件数と必ず一致させること
  // （window.qaSection.itemCountから実測するのでここでは決め打ちしない）。
  const QA_ITEM_COUNT_FALLBACK = 3;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function clamp01(v) {
    return Math.min(1, Math.max(0, v));
  }

  /* ==========================================================
     計測まわりの状態（リサイズ時に測り直す）
  =========================================================== */

  const layout = {
    revealDist: 0,          // フェーズA（マスクが開く）に要するスクロール距離(px)
    bendDist: 0,            // フェーズA2（見出しが弧に曲がる）に要するスクロール距離(px)
    textDist: 0,            // 本文を最後まで動かすのに実際に必要な距離(px)＝scrollTopの可動域そのもの
    textScrollBudget: 0,    // フェーズBに実際に割り当てる物理スクロール距離(px)＝textDist×TEXT_SCROLL_SLOWDOWN
    memoryEnterDist: 0,      // フェーズC1（MEMORYが水平にスライドインして重なる）に要するスクロール距離(px)
    memoryPanDist: 0,        // フェーズC2で実際にキャンバスをパンさせる必要がある物理ピクセル量(px)＝canvas幅−ビューポート幅
    memoryPanBudget: 0,      // フェーズC2に実際に割り当てる物理スクロール距離(px)＝memoryPanDist×MEMORY_PAN_SLOWDOWN
    messageEnterDist: 0,     // フェーズD（背景タイルの登り切り＋カードのリール演出）に要するスクロール距離(px)
    qaEnterDist: 0,          // フェーズE1（MESSAGE→QAのプッシュ切り替え）に要するスクロール距離(px)
    qaCardsDist: 0,          // フェーズE2（QAのカード送り、3問ぶん合計）に要するスクロール距離(px)
    fromMeEnterDist: 0,      // フェーズF（Q&A→FROM MEのプッシュ切り替え）に要するスクロール距離(px)
    tbcTextEnterDist: 0,     // フェーズG（FROM ME→TBC文字ページ、PT-07ズーム＋フェード）に要するスクロール距離(px)
    tbcSplitDist: 0,         // フェーズH（TBC文字ページ→TBC画像シーン、PT-12スプリット）に要するスクロール距離(px)
    maxRadius: 0,           // マスクが開き切った時の円の半径(px)
    headingRestShift: 0,    // 見出しの静止位置を決める基準シフト量(px)
  };

  function setHeadingShift(px) {
    if (aboutStage) aboutStage.style.setProperty('--about-heading-shift', `${px}px`);
  }

  // 見出し下端〜本文1行目上端の実際のレイアウトを測って、GAP_PXぶんの
  // 隙間ができる静止シフト量を逆算する。
  function measureHeadingRestShift() {
    if (!headingSubEl || !aboutTextEl) return 0;

    const prevScrollTop = aboutTextEl.scrollTop;
    setHeadingShift(0);
    aboutTextEl.scrollTop = 0;

    // 見出しは「弧に曲がりきった状態(bend=1)」で静止する（フェーズA2の
    // 終わり=bendEndで setHeadingBend(1) になり、以降フェーズCまでずっと
    // bend=1のまま）。ところがこの関数が呼ばれる時点（初回はまだ一度も
    // スクロールしていないページ読み込み直後、以後はリサイズやフォント
    // 読み込み完了時の再計測）では、弧はまだ曲がっていない
    // 初期状態(bend=0、flatなSVGパス)のことが多い。sub側のパスは
    // Y座標が170(flat)→102(curve)まで動くため、bend=0のまま測ると
    // 実際の静止位置とはheadingBottomが数十pxズレてしまい、算出される
    // 隙間が意図したGAP_PXより大きく（＝隙間が広く）なってしまっていた。
    // そのため測定の瞬間だけbend=1に切り替えて「実際に静止する見た目」で
    // 測る。元のbend比率へは明示的に戻していないが、measureLayout()の
    // 呼び出し元は必ず直後に setTarget(..., {instant:true}) → render() を
    // 同期的に呼び、そちらが現在のスクロール位置に応じた正しいbend値を
    // 上書きするため、画面に一瞬でも誤った状態が描画されることはない。
    setHeadingBend(1);

    // 見出しの実測は、about-arc.js側の「登場演出前の隠れた状態
    // (dy:-70, opacity:0)」を一時的に解除した「本来の位置」で行う
    // 必要がある。measureAtRest()が無い場合（about-arc.jsが未読込など）
    // はそのまま測る。
    // ※本人指摘「見出しの余白がなくなってた」の原因調査で判明：登場
    // 演出が再生される前（サークルにユーザーがまだ到達していない状態）
    // でも、ページ読み込み直後や後述のフォント読み込み完了時の
    // 再計測はこのタイミングで走り得るため、隠れた状態のまま測ると
    // 実際の表示位置とズレた値を拾ってしまい、結果として見出しと本文の
    // 隙間が消えたり負の値になったりする不具合があった。
    const measure = () => {
      const headingBottom = headingSubEl.getBoundingClientRect().bottom;
      const firstLine = aboutTextEl.querySelector('[data-readline]');
      const firstLineTop = firstLine ? firstLine.getBoundingClientRect().top : null;
      return { headingBottom, firstLineTop };
    };

    const { headingBottom, firstLineTop } = (window.aboutHeading && typeof window.aboutHeading.measureAtRest === 'function')
      ? window.aboutHeading.measureAtRest(measure)
      : measure();

    aboutTextEl.scrollTop = prevScrollTop;

    return firstLineTop === null ? 0 : firstLineTop - GAP_PX - headingBottom;
  }

  function measureLayout() {
    const vh = window.innerHeight;

    layout.revealDist = vh; // 1画面ぶんスクロールしたらマスクが開き切る
    layout.bendDist = vh * BEND_SCREENS; // 見出しが曲がり切るまでのスクロール距離
    layout.textDist = aboutTextEl
      ? Math.max(0, aboutTextEl.scrollHeight - aboutTextEl.clientHeight)
      : 0;
    // 実際に本文を動かすのに必要な距離(textDist)より、意図的に長い
    // スクロール距離を割り当てて「ゆっくりさ」を作る（本文自体の
    // 可動域や座標は変えず、そこに至るまでの助走を伸ばすだけ）。
    layout.textScrollBudget = layout.textDist * TEXT_SCROLL_SLOWDOWN;

    // .page__frame は cover表示のためビューポートより大きいことがある
    // （横長画面では100vh*1440/900が100vwを上回る）ので、frame自身の
    // 実寸から半径を出して、開き切った時にframe全体を覆えるようにする。
    // 中心が下端(CENTER_Y=100%)にあるので、覆うべき最遠点は左右の
    // 上端の角（中心からの距離 = hypot(幅/2, 高さ)）になる。
    layout.maxRadius = aboutFrame
      ? Math.hypot(aboutFrame.getBoundingClientRect().width / 2, aboutFrame.getBoundingClientRect().height) + 8
      : Math.hypot(window.innerWidth / 2, vh) + 8;

    layout.headingRestShift = measureHeadingRestShift();

    layout.memoryEnterDist = vh * MEMORY_ENTER_SCREENS; // MEMORYが水平に重なり切るまでの距離

    // キャンバスの実測幅とビューポート幅の差＝実際にパンさせる必要がある
    // 物理ピクセル量。memoryFrame（=ビューポート）の実寸を使うことで、
    // 横長画面でframeがビューポートより大きいケース（cover表示）にも
    // 追従する（ABOUTのmaxRadius計算と同じ考え方）。
    if (memoryCanvas && memoryFrame) {
      const frameWidth = memoryFrame.getBoundingClientRect().width;
      const canvasWidth = memoryCanvas.getBoundingClientRect().width;
      layout.memoryPanDist = Math.max(0, canvasWidth - frameWidth);
    } else {
      layout.memoryPanDist = 0;
    }
    layout.memoryPanBudget = layout.memoryPanDist * MEMORY_PAN_SLOWDOWN;

    layout.messageEnterDist = vh * MESSAGE_ENTER_SCREENS; // 背景の登り切り＋カードのリール演出に要する距離

    layout.qaEnterDist = vh * QA_ENTER_SCREENS; // MESSAGE→QAのプッシュ切り替えに要する距離
    const qaItemCount = (window.qaSection && window.qaSection.itemCount) || QA_ITEM_COUNT_FALLBACK;
    layout.qaCardsDist = vh * QA_CARD_SCREENS * qaItemCount; // QAのカード送り（3問ぶん合計）に要する距離
    layout.fromMeEnterDist = vh * FROM_ME_ENTER_SCREENS;
    layout.fromMeRestDist = vh * FROM_ME_REST_SCREENS;
    layout.tbcTextEnterDist = vh * TBC_TEXT_ENTER_SCREENS;
    layout.tbcTextRestDist = vh * TBC_TEXT_REST_SCREENS;
    layout.tbcSplitDist = vh * TBC_SPLIT_SCREENS;

    // 本人指摘：「最後のセクションに辿り着いてもスクロールが止まって
    // ない」→ 以前はここに1画面ぶんの余白(restDist)を足していたが、
    // これはPT-12スプリットが完全に開き切った後も見た目には何も
    // 変化しないままさらに1画面ぶん スクロールし続けられてしまい、
    // 「ページの終わりで止まった感じがしない」原因になっていた。
    // 将来ページを追加する際はこの値を増やして助走を作ればよい
    // （現状は0＝スプリットが開き切った位置がそのままスクロール終端）。
    const restDist = 0;
    scrollStage.style.height = `${vh + layout.revealDist + layout.bendDist + layout.textScrollBudget + layout.memoryEnterDist + layout.memoryPanBudget + layout.messageEnterDist + layout.qaEnterDist + layout.qaCardsDist + layout.fromMeEnterDist + layout.fromMeRestDist + layout.tbcTextEnterDist + layout.tbcTextRestDist + layout.tbcSplitDist + restDist}px`;
  }

  /* ==========================================================
     登場演出トリガー（見出しの1文字バウンス／本文のobserver開始）
     サークルの広がり(revealRatio: 0〜1)がHEADING_TRIGGER_REVEAL_RATIO
     に達した時点で1回だけ'about:enter'を発火する。1（＝サークルが
     完全に開いて、切り抜き写真がすべて見えた状態）をデフォルトにして
     いるが、必要ならここの値を下げれば「まだ広がりきっていない途中」
     でも発火できる。about-arc.js（見出し）とinteractions.js（本文の
     IntersectionObserver開始）の両方がこのイベントを起点にしている。
  =========================================================== */

  const HEADING_TRIGGER_REVEAL_RATIO = 1;

  let headingIntroFired = false;
  function maybeFireHeadingIntro(revealRatio) {
    if (!headingIntroFired && revealRatio >= HEADING_TRIGGER_REVEAL_RATIO) {
      headingIntroFired = true;
      window.dispatchEvent(new CustomEvent('about:enter'));
    }
  }

  /* ==========================================================
     描画：追従後のスクロール量(progressY)から見た目を決める
  =========================================================== */

  function setHeadingBend(ratio) {
    if (window.aboutHeading && typeof window.aboutHeading.setBend === 'function') {
      window.aboutHeading.setBend(ratio);
    }
  }

  // TY-15 読み進め強調（本文の文字色）。scrollTopを確定させた"後"に
  // 呼ぶことで、実際に描画された文字位置から距離を測れる。連続的な
  // 位置→色の関数なので、行き/帰りどちらのスクロールでも同じ道を
  // なぞって自然に色が変わる（interactions.js側の実装を参照）。
  function updateReadingColors() {
    if (window.aboutReading && typeof window.aboutReading.update === 'function') {
      window.aboutReading.update();
    }
  }

  // フェーズC1：MEMORYのフレームを画面左の外側(ratio:0)から定位置
  // (ratio:1)まで水平に動かす。ABOUTは指示通り常に固定（transformを
  // 当てない）ので、MEMORYが左からその上に水平に重なってくる見た目になる。
  function setMemoryEnter(ratio) {
    if (!memoryFrame) return;
    const tx = (1 - ratio) * -100; // -100%(画面外・左) → 0%
    memoryFrame.style.transform = ratio >= 1 ? '' : `translateX(${tx}%)`;
  }

  // フェーズC2：重なり切った直後は右側のクラスター（キャンバス終端）が
  // 画面に見えている状態にしておき、そこからスクロールに連動して
  // キャンバスを右へパン（tx:-panDist→0）させることで、写真が画面の
  // 左から入ってきて右へ流れ、右へ抜けていくように見せる
  // （＝フレーム自体の「左から重なってくる」入りと、同じ「左→右」の
  // 流れで一貫させている）。
  function setMemoryPan(ratio) {
    if (!memoryCanvas) return;
    // 横に長い(3661px超)キャンバスをtranslateXする都合上、小数px値のまま
    // だとGPU側のタイル分割の継ぎ目に薄い縦線が入って見えることがあるため、
    // 整数pxに丸めてから当てる（サブピクセルのアンチエイリアシングが
    // タイル境界でズレるのを防ぐ）。
    const tx = Math.round(-(1 - ratio) * layout.memoryPanDist); // -memoryPanDist(px) → 0px
    memoryCanvas.style.transform = `translateX(${tx}px)`;

    // パララックス：キャンバス自体はすべての写真に同じtxを一律に
    // 与えるので、そこに「(depth-1)×tx」ぶんの追加オフセットを
    // 個々の写真へさらに足すことで、写真ごとに実質の移動量を変える
    // （depth>1＝キャンバスより余分に動く＝手前で速い、
    //   depth<1＝キャンバスより動きが控えめ＝奥でゆっくり）。
    // こちらも同じ理由で整数pxに丸める。
    for (let i = 0; i < memoryParallaxItems.length; i++) {
      const item = memoryParallaxItems[i];
      const extra = Math.round(tx * (item.depth - 1));
      item.el.style.transform = extra ? `translateX(${extra}px)` : '';
    }
  }

  // フェーズD：MEMORY→MESSAGEの「プッシュ型」切り替え＋NP-X18
  // 「リールが回って止まる」。
  // MEMORYは写真のパン(フェーズC2)が最後まで終わった時点でratio=0として
  // 一旦そこに留まり（＝「端まで行ったら固定」）、そこから先の
  // スクロールでratioが0→1に進むと、MEMORYが画面の上へ、MESSAGEが
  // 画面の下から、同じ量だけ入れ替わりにtranslateYする（下記
  // setMemoryExit()参照）。これにより、MESSAGEがMEMORYの上に重なる
  // 「層」を作って覆い隠すのではなく、MEMORYがスクロールで上へ抜けて
  // いきながらMESSAGEが下から続けて現れる、という一続きのスクロールと
  // して見える（本人指示）。
  // このratioは同時に、背景タイルがどれだけ登り切ったか、カードが
  // どれだけ正面へ収束したかも駆動する共通の値（本人指示の「背景が
  // 登ってる間にカードが回転しながら出現」を、同じスクロール量に
  // 同期させることで表現している）。
  //   - MEMORY：setMemoryExit()でtranslateY(0)→translateY(-100%)へ
  //     画面上へ抜けていく。
  //   - セクション全体(.message__stage)：translateY(100%)→translateY(0)
  //     で画面下から入れ替わりに現れる。背景タイル(.message__bg-rise)や
  //     タイトル・見出しは、このセクション自体の動きにそのまま乗って
  //     一緒に現れるだけで、タイル側に別途遅れて追いつくような独自の
  //     translateYは掛けていない（以前はタイルだけ一段遅れて登ってくる
  //     重層的な動きにしていたが、本人指示により「MESSAGEの文字などと
  //     一緒に固定」でよいとのことでシンプルな単一の動きに変更した）。
  //   - カード(.message__card)：上方(-MESSAGE_CARD_RISE_VW)から中央(0)へ
  //     移動しつつ、二乗イージングで減速しながら計3回転(-1080deg→0deg)して
  //     正面でぴたっと止まる。回転軸はrotateY（縦の軸を中心に横方向へ
  //     回る＝本人指示により縦回転(rotateX)から横回転に変更）。カードは
  //     表面・裏面の2枚の平面を重ねた「両面カード」構造（CSS側、
  //     .message__card-face--front/--back）になっているため、回転中
  //     どの角度でも必ずどちらかの面が見えている（以前あった
  //     backface-visibility:hiddenによる「回転中に消える」問題は
  //     3Dモデルを使わずこの構造で解消済み。詳細はstyle.css側のコメント
  //     参照）。
  // ratio>=MESSAGE_CARD_SETTLE_RATIO（セクション入場の9割まで進んだ
  // 時点）になった瞬間だけis-settledを付与してtransformのinlineスタイル
  // を明示的にクリアする（以降のtransform制御はmessage-card.jsのチルト
  // 演出に引き継ぐ。ここで毎フレーム空文字を再代入してもコストは無視できる
  // 程度だが、念のためis-settled付与は一度きりにしておく）。
  // カード自身の回転・フェード・浮き上がり演出は、そのままだとratio=1
  // まで続いてしまうので、cardR（rをMESSAGE_CARD_SETTLE_RATIOで割って
  // 0〜1に正規化した値）で計算し直すことで、r=MESSAGE_CARD_SETTLE_RATIO
  // の時点でちょうど「回転が正面で止まった完成形」になるよう前倒しして
  // いる。.message__stage自体のtranslateY（背景・見出しの入場）は従来
  // どおりrをそのまま使うので、カードが先に静止・操作可能になった後も
  // 背景側は残りのスクロール分だけ引き続きせり上がってくる。
  let messageWasSettled = false;
  function setMessageEnter(ratio) {
    if (!messageCard) return;
    const r = clamp01(ratio);

    if (messageStage) {
      messageStage.style.transform = r >= 1 ? '' : `translateY(${(1 - r) * 100}%)`;
    }

    if (r >= MESSAGE_CARD_SETTLE_RATIO) {
      if (!messageWasSettled) {
        messageCard.style.transform = '';
        messageCard.style.opacity = '';
        messageCard.classList.add('is-settled');
        messageWasSettled = true;
      }
      return;
    }

    if (messageWasSettled) {
      messageCard.classList.remove('is-settled');
      messageWasSettled = false;
    }

    const cardR = clamp01(r / MESSAGE_CARD_SETTLE_RATIO);
    const decel = Math.pow(1 - cardR, 2); // 1→0。終盤ほど変化が小さくなる＝減速
    const spinDeg = -MESSAGE_CARD_SPIN_TURNS * 360 * decel;
    const riseVw = -decel * MESSAGE_CARD_RISE_VW;
    const opacity = Math.min(1, cardR / MESSAGE_CARD_FADE_RATIO);
    // 1/3→1への拡大。回転・降下と同じdecel（二乗の減速）にすると序盤で
    // 一気に大きくなってしまい（検証：セクションが36%見えた時点で0.76倍）、
    // 「最初は小さい＝まだ触れない」が伝わりにくかったため、拡大だけは
    // smoothstep（ゆっくり始まり→中盤で大きくなり→固定の瞬間に向けて減速）
    // にしている。固定の瞬間（cardR=1）にちょうど等倍・変化量0になるので、
    // is-settledでtransformを外しても大きさが跳ねない。
    const grow = cardR * cardR * (3 - 2 * cardR);
    const scale = MESSAGE_CARD_START_SCALE + (1 - MESSAGE_CARD_START_SCALE) * grow;
    messageCard.style.opacity = String(opacity);
    messageCard.style.transform = `translateY(${riseVw}vw) rotateY(${spinDeg}deg) scale(${scale.toFixed(4)})`;
  }

  // MEMORY→MESSAGEのプッシュ型切り替えで、MEMORY側を押し出す関数。
  // ratio(0〜1、setMessageEnterと同じ値)ぶん、MEMORYのフレーム自体を
  // 画面の上へtranslateYで押し出す（ratio=0で定位置、ratio=1で自分の
  // 高さぶん丸ごと画面上へ抜け切る）。setMessageEnter側の
  // .message__stageが同じratioで画面下から入れ替わりに現れるので、
  // 「MEMORYが上へ、MESSAGEが下から」同時に動く一続きのスクロールに
  // 見える。
  // memoryFrame自体はフェーズC1(setMemoryEnter)でも同じtransform
  // プロパティを使っている（左からの水平スライドイン）が、フェーズC1と
  // このフェーズDが同時に動くことはない（間にC2のパン区間を挟む）ので、
  // 「あとから呼んだ方の値で上書きされる」で問題なく成立する。
  function setMemoryExit(ratio) {
    if (!memoryFrame) return;
    const r = clamp01(ratio);
    memoryFrame.style.transform = r <= 0 ? '' : `translateY(${-r * 100}%)`;
  }

  function setMessageActive(isActive) {
    if (!messagePage) return;
    if (isActive) {
      messagePage.classList.add('is-active');
    } else {
      messagePage.classList.remove('is-active');
    }
  }

  // フェーズE1：MESSAGE→QAの切り替えで、上の層(MESSAGE)を退場させる
  // 関数。ratio(0〜1)ぶん、.message__stage自体を画面の上へtranslateYで
  // 押し出す（ratio=0で定位置、ratio=1で自分の高さぶん丸ごと画面上へ
  // 抜け切る）。仕組みはsetMemoryExit()と完全に同じ（対象がmemoryFrame
  // からmessageStageに変わっただけ）。
  // messageStage.style.transformはフェーズDのsetMessageEnter()も
  // 書き換える共有プロパティだが、フェーズDとこのフェーズE1が同時に
  // 動くことはない（間に無いので、後から呼んだ方の値で上書きされる
  // という既存の仕組みがそのまま成立する）。
  // ※本人指示でMESSAGE→QAを「プッシュ型」からPT-05「リビール型」へ
  // 変更（MESSAGEが上の層、QAが下の層）。リビールでは下の層(QA)は
  // 動かさないので、動くのはこの関数（MESSAGE側）だけになった
  // （QA側は下のsetQaEnter参照）。
  function setMessageExit(ratio) {
    if (!messageStage) return;
    const r = clamp01(ratio);
    messageStage.style.transform = r <= 0 ? '' : `translateY(${-r * 100}%)`;
  }

  // フェーズE1：QA側（下の層）。リビールでは下の層は動かさず、常に
  // 定位置に静止させておくだけでよい（実体はqa.js側の
  // window.qaSection.setEnter()に委譲。中身は常にtransformを空にする
  // だけの関数になっている）。MESSAGEが上から退場するにつれて、
  // 最初から定位置にいたQAが徐々に露わになっていく——これがリビール
  // （PT-05）の仕組み。引数のratioは現状使っていないが、呼び出し元
  // （フェーズE1のqaRatio）との対応がひと目で分かるよう残してある。
  function setQaEnter(ratio) {
    if (window.qaSection && typeof window.qaSection.setEnter === 'function') {
      window.qaSection.setEnter(clamp01(ratio));
    }
  }

  // フェーズF1：QA→FROM MEの「アイリス（円形ワイプ）」切り替え。
  // 実体はqa.js側のsetIris()に委譲（QA全体を中央からすぼめて消す。
  // 詳細はqa.js側のコメント参照）。以前はここでQAを画面上へ押し出す
  // 単純なtranslateYだったが、QA→FROM MEはデザインの雰囲気が大きく
  // 変わる節目なので、他の「プッシュ型」の切り替えとは質感を変えた
  // アイリス演出に作り直した。
  function setQaIris(ratio) {
    if (window.qaSection && typeof window.qaSection.setIris === 'function') {
      window.qaSection.setIris(clamp01(ratio));
    }
  }

  // フェーズF1：FROM MEは（以前のような画面下からの押し出しではなく）
  // 最初から定位置・等倍で静止して待機しているだけにする。QA側の
  // アイリス（setQaIris）がすぼまって消えていく分だけ、その円の外側
  // から自然に現れて見える——という設計なので、FROM ME自身は動かす
  // 必要がない。
  //
  // ただし素のCSS上の重なり順（#page-from-me.page.is-activeのz-index:6）
  // はQAのz-index:4より手前に来るよう定義済み。そのままだとFROM MEが
  // QAより手前に描画されてしまい、QAのアイリスが閉じきる前からFROM ME
  // でQA全体を覆い隠してしまう。
  // ※最初はFROM ME側のz-indexをQAより下げる案で実装したが、MEMORY
  //   (z-index:3)・MESSAGE(z-index:5)は本ページ到達後もis-activeの
  //   まま維持され続ける仕組みのため、FROM MEをそれより下げてしまうと
  //   QAの円の外側にMEMORY／MESSAGEの背景（明るい黄色系）が透けて
  //   見えてしまう不具合になった（実機検証で発覚）。
  //   そこで逆に、アイリスが閉じきる（ratio=1）までの間だけQA側の
  //   z-indexを一時的にFROM MEより上（7）へ引き上げる方式に変更。
  //   FROM ME(6)は元々MEMORY/MESSAGEより上にいるので、「QA(7)が
  //   一番手前、その次にFROM ME(6)」という順序が常に保たれ、
  //   円の外側にはFROM MEだけが正しく透けて見える。閉じきったら
  //   空文字に戻してCSS側のz-index:4（＝FROM ME(6)より下）に委ねる。
  //   （※QAの既定z-index自体、本人指示によるMESSAGE→QAの「リビール型」
  //   変更でMESSAGE(5)より下の4になっている。詳細はstyle.css側の
  //   #page-message.page.is-active／#page-qa.page.is-activeのコメント
  //   参照）。
  function setQaStackAboveFromMe(isAbove) {
    if (!qaPage) return;
    qaPage.style.zIndex = isAbove ? '7' : '';
  }

  function setFromMeActive(isActive) {
    if (!fromMePage) return;
    if (isActive) {
      fromMePage.classList.add('is-active');
    } else {
      fromMePage.classList.remove('is-active');
    }
  }

  // TBC画像シーン（PAGE 8）の巨大画像の先読みデコード。
  // ※本人指摘「センターが割れて最後のセクションに行く演出だけど
  // 重いからか分からないけどスムーズじゃない」への対応の一つ。
  // PAGE 8は.page{visibility:hidden}がデフォルトで、setTbcSceneActive
  // (is-active付与)されるまでブラウザは実質的にペイントしない——
  // 従来はフェーズH（PT-12スプリット）が始まる、まさにその瞬間に
  // 初めてis-activeが付き、9枚の巨大画像を一斉にデコード・ペイントする
  // ことになっていた（＝スプリットのアニメーションと同じフレームに
  // 重い初回デコードが乗ってしまい、カクつきの主因になっていたと
  // 判断）。
  // ここでは画像を実際に「見せる」のではなく、HTMLImageElement.decode()
  // で中身だけを先にデコードさせておく（メインスレッドをブロックしない
  // 非同期デコード）。FROM MEに到達した時点——スプリットが始まるまで
  // まだQ&A・FROM ME・TBC文字ページぶんのスクロール距離が残っている
  // ——で呼び出すことで、実際にPAGE 8が可視化される頃にはすでに
  // デコード済みになっている（＝以後はただの合成＝軽い）状態を狙って
  // いる。一度実行すれば十分なので内部フラグで多重実行を防いでいる
  // （decode()の対象はPAGE 8のimg要素のみで、表示状態には一切影響しない）。
  // ※背景を動画(tbc-scene.mp4)に差し替えた際、同じ理屈（見える瞬間に
  // 初めて読み込みが走ると重い）で動画側も先読みしておくようにした。
  // <video preload="metadata">のままだと実際にis-activeが付いて
  // 初めて本体データの取得が始まってしまうため、ここでpreloadを
  // 'auto'へ切り替えてload()を呼び、バッファリングを前倒しで
  // 開始させる（表示状態には影響しない＝.page{visibility:hidden}の
  // ままなので画面には何も見えない）。
  let tbcSceneWarmUpStarted = false;
  function warmUpTbcSceneImages() {
    if (tbcSceneWarmUpStarted || !tbcScenePage) return;
    tbcSceneWarmUpStarted = true;
    const imgs = tbcScenePage.querySelectorAll('img');
    imgs.forEach((img) => {
      if (typeof img.decode === 'function') {
        // decode()が失敗しても（画像未対応環境やネットワーク遅延など）
        // 通常のimg読み込み・表示自体には影響しないため無視してよい。
        img.decode().catch(() => {});
      }
    });
    if (tbcSceneVideo) {
      tbcSceneVideo.preload = 'auto';
      tbcSceneVideo.load();
    }
  }

  // フェーズF1：本文（1行ずつ）の登場。実体はfrom-me.js側の
  // setReveal()に委譲（呼び出し元でtextRatioへ再マッピングした値を
  // 渡している。詳細はfrom-me.js冒頭コメント参照）。
  function setFromMeReveal(ratio) {
    if (window.fromMeSection && typeof window.fromMeSection.setReveal === 'function') {
      window.fromMeSection.setReveal(clamp01(ratio));
    }
  }

  function setTbcTextActive(isActive) {
    if (!tbcTextPage) return;
    if (isActive) {
      tbcTextPage.classList.add('is-active');
    } else {
      tbcTextPage.classList.remove('is-active');
    }
  }

  // フェーズG：FROM ME→TBC文字ページの「PT-07 ズーム＋フェード」。
  // FROM ME自身は動かさず定位置に静止させたまま、このページ(.tbc-text)
  // だけをratio=0でわずかに縮小(scale .85)・完全透明の状態から、
  // ratio=1で等倍(scale 1)・完全不透明まで連続的に拡大しながら
  // フェードインさせ、FROM MEの上に重ねて覆っていく。
  function setTbcTextEnter(ratio) {
    if (!tbcTextEl) return;
    const r = clamp01(ratio);
    tbcTextEl.style.opacity = String(r);
    const scale = 0.85 + 0.15 * r;
    tbcTextEl.style.transform = r >= 1 ? '' : `scale(${scale})`;
  }

  // 背景動画の再生管理はfrom-me.js（.from-me__video）と同じ方針：
  // 画面に見えている（is-active）間だけ再生し、それ以外は一時停止して
  // 無駄な再生・デコード負荷を避ける。
  function setTbcSceneActive(isActive) {
    if (!tbcScenePage) return;
    if (isActive) {
      tbcScenePage.classList.add('is-active');
      if (tbcSceneVideo) {
        const playPromise = tbcSceneVideo.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {});
        }
      }
    } else {
      tbcScenePage.classList.remove('is-active');
      if (tbcSceneVideo) tbcSceneVideo.pause();
    }
  }

  // フェーズH：TBC文字ページ→TBC画像シーンページの「PT-12
  // スプリット」。TBC文字ページ自体（左右2枚の.tbc-text__panel）を
  // ratio=0でぴったり重なった定位置から、ratio=1で左右それぞれ
  // 画面外(±100%)まで裂けて退場させる。下に最初から定位置で待機して
  // いるTBC画像シーンページ（すでにsetTbcSceneActive(true)でis-active
  // になっている）が、裂け目から徐々に露わになっていく。
  function setTbcSplit(ratio) {
    if (!tbcTextPanelL || !tbcTextPanelR) return;
    const r = clamp01(ratio);
    tbcTextPanelL.style.setProperty('--tbc-split-x', String(-r * 100));
    tbcTextPanelR.style.setProperty('--tbc-split-x', String(r * 100));
  }

  // フェーズE2：QAのカード送り。実体はqa.js側のsetCards()に委譲。
  function setQaCards(ratio) {
    if (window.qaSection && typeof window.qaSection.setCards === 'function') {
      window.qaSection.setCards(clamp01(ratio));
    }
  }

  function setQaActive(isActive) {
    if (!qaPage) return;
    if (isActive) {
      qaPage.classList.add('is-active');
    } else {
      qaPage.classList.remove('is-active');
    }
  }

  function render(progressY) {
    applyScrollPhases(progressY);
    updateReadingColors();
  }

  // MEMORYセクションが実際に「表示中→非表示」に切り替わった瞬間だけ
  // memory:leaveを発火する（動画の再生を止めるトリガー）。
  // 以前はrender()が呼ばれるたびに一旦is-activeを外してから
  // 付け直す実装だったため、スクロールの慣性が収まるまでの毎フレームで
  // 誤発火し、スクロール中に動画が止まってしまう不具合があった。
  let memoryWasActive = false;
  function setMemoryActive(isActive) {
    if (!memoryPage) return;
    if (isActive) {
      memoryPage.classList.add('is-active');
    } else {
      memoryPage.classList.remove('is-active');
    }
    if (memoryWasActive && !isActive) {
      window.dispatchEvent(new CustomEvent('memory:leave'));
    }
    memoryWasActive = isActive;
  }

  function applyScrollPhases(progressY) {
    fvPage.classList.add('is-active');

    // MEMORYはフェーズC（水平に重なって現れる演出）に入るまで画面外・
    // 非表示がデフォルト。各分岐で個別に上書きするので、ここで一度
    // リセットしておく（表示状態(is-active)の切り替えはsetMemoryActive
    // 側でのみ行い、ここでは見た目のtransformだけ戻す）。
    // MEMORYはフェーズC（水平に重なって現れる演出）に入るまで画面外・
    // 非表示がデフォルト。各分岐で個別に上書きするので、ここで一度
    // リセットしておく（表示状態(is-active)の切り替えはsetMemoryActive
    // 側でのみ行い、ここでは見た目のtransformだけ戻す）。
    // ※MESSAGE（setMessageEnter）はここでは呼ばない：一度固定
    //   （is-settled）された後はtransformの制御をmessage-card.jsの
    //   チルト演出へ引き継ぐ設計のため、他フェーズにいる時にだけ
    //   （＝各早期returnの中で個別に）0へ戻す。ここで毎フレーム
    //   無条件に0を書き戻すと、フェーズD到達後も再設定のたびに
    //   「一瞬だけ回転位置へ戻ってまた正面へ戻る」ちらつきが起きる。
    setMemoryEnter(0);
    setMemoryPan(0);
    setMemoryExit(0);
    // setMessageExit()はmessageStageのtransformを書き換えるだけで
    // messageCard自体には触れない（message-card.jsのチルト演出とは
    // 別要素）ので、setMemoryExitと同じく毎フレーム無条件に0へ戻して
    // 問題ない：フェーズE1に入った時だけ、この直後の分岐内で
    // 改めて実際の値を渡し直して上書きする（setMemoryEnter/Exitと
    // 同じ「後から呼んだ方が勝つ」パターン）。
    setMessageExit(0);
    setQaEnter(0);
    setQaIris(0);
    // setQaCards()はここでは呼ばない：setMessageExitと同じ理由に加えて、
    // setQaCards()はqa.js側でCSSトランジション付きの進捗ドット
    // （.qa__progress-dot）のクラス切り替えを行うため、ここで毎フレーム
    // 無条件に0へ戻してからフェーズE2の分岐内で本来の値へ再度上書きすると、
    // 1フレームの中で「0番へ戻す→本来の値へ戻す」という2回のクラス
    // 切り替えが同期的に発生してしまい、トランジションが一切完了しない
    // （進捗ドットが機能しないように見える）不具合になっていた。
    // フェーズE2に到達するまでの各早期returnの中で個別に0へ戻す。
    setFromMeActive(false);
    setQaStackAboveFromMe(false);
    setFromMeReveal(0);
    // フェーズG／Hも同じ理由（setFromMeReveal等と同様、is-activeの
    // トグルを除けばどのタイミングで毎フレーム0に戻しても副作用がない
    // 連続関数なので、ここで一括リセットしてから該当フェーズの分岐内で
    // 本来の値に上書きする）。
    setTbcTextActive(false);
    setTbcTextEnter(0);
    setTbcSceneActive(false);
    setTbcSplit(0);

    if (progressY <= 0) {
      aboutPage.classList.remove('is-active');
      if (aboutFrame) aboutFrame.style.clipPath = `circle(0px at ${CENTER_X} ${CENTER_Y})`;
      if (aboutTextEl) aboutTextEl.scrollTop = 0;
      setHeadingShift(layout.headingRestShift);
      setHeadingBend(0);
      setMemoryActive(false);
      setMessageActive(false);
      setMessageEnter(0);
      setQaActive(false);
      setQaCards(0);
      return;
    }

    aboutPage.classList.add('is-active');

    if (progressY <= layout.revealDist) {
      // フェーズA：マスクがスクロール量に比例して開いていく。
      // 見出しはまだ本文スクロール前＝静止位置のまま、弧もまだ平ら。
      const ratio = layout.revealDist > 0 ? progressY / layout.revealDist : 1;
      if (aboutFrame) aboutFrame.style.clipPath = `circle(${ratio * layout.maxRadius}px at ${CENTER_X} ${CENTER_Y})`;
      if (aboutTextEl) aboutTextEl.scrollTop = 0;
      setHeadingShift(layout.headingRestShift);
      setHeadingBend(0);
      maybeFireHeadingIntro(ratio);
      setMemoryActive(false);
      setMessageActive(false);
      setMessageEnter(0);
      setQaActive(false);
      setQaCards(0);
      return;
    }

    // フェーズAを終えている＝サークルは完全に開いている
    maybeFireHeadingIntro(1);
    if (aboutFrame) aboutFrame.style.clipPath = ''; // 写真クリックなどを阻害しないように外す

    const bendEnd = layout.revealDist + layout.bendDist;

    if (progressY <= bendEnd) {
      // フェーズA2：見出しが弧に曲がっていく。本文はまだ動かさない
      // （scrollTop 0に固定）ので、読み飛ばしのワンクッションになる。
      const bendRatio = layout.bendDist > 0 ? (progressY - layout.revealDist) / layout.bendDist : 1;
      if (aboutTextEl) aboutTextEl.scrollTop = 0;
      setHeadingShift(layout.headingRestShift);
      setHeadingBend(bendRatio);
      setMemoryActive(false);
      setMessageActive(false);
      setMessageEnter(0);
      setQaActive(false);
      setQaCards(0);
      return;
    }

    const textEnd = bendEnd + layout.textScrollBudget;

    if (progressY <= textEnd) {
      // フェーズB：本文のscrollTopを追従後のスクロール量から算出する。
      // 生のスクロール量(rawRatio)をそのまま使わず、イージングを掛けた
      // easedRatioを使う＝序盤はスクロールしてもほとんど本文が動かず、
      // 後半になるほどスムーズに流れ出す（文字がアクティブになる
      // ペースと本文が動くペースを同じカーブで連動させている）。
      // 見出しも「本文の一番上の行」として同じ量だけ一緒に動かす
      // （弧に曲がりきった状態のまま、一緒にスクロールアウトしていく）。
      setHeadingBend(1);
      const textScrollY = progressY - bendEnd;
      const rawRatio = layout.textScrollBudget > 0 ? clamp01(textScrollY / layout.textScrollBudget) : 1;
      const easedRatio = Math.pow(rawRatio, TEXT_SCROLL_EASE_POWER);
      const easedTextScrollY = easedRatio * layout.textDist;
      if (aboutTextEl) aboutTextEl.scrollTop = easedTextScrollY;
      setHeadingShift(layout.headingRestShift - easedTextScrollY);
      setMemoryActive(false);
      setMessageActive(false);
      setMessageEnter(0);
      setQaActive(false);
      setQaCards(0);
      return;
    }

    // フェーズC以降：本文を読み終えた状態のまま固定しておく（本文が
    // また動くと落ち着かないため）。ABOUTは指示通り常に固定
    // （is-activeも外さない＝裏に隠れているだけ）。
    setHeadingBend(1);
    if (aboutTextEl) aboutTextEl.scrollTop = layout.textDist;
    setHeadingShift(layout.headingRestShift - layout.textDist);

    const enterEnd = textEnd + layout.memoryEnterDist;

    if (progressY <= enterEnd) {
      // フェーズC1：MEMORYのフレームが画面左から水平に重なってくる。
      // 生のスクロール比率(rawEnterRatio)をそのまま使わず、べき乗で
      // イージングした値(easedEnterRatio)を使う＝スクロールし始めの
      // 序盤は移動量を控えめにして、少し減速がかかったように見せる。
      const rawEnterRatio = layout.memoryEnterDist > 0 ? clamp01((progressY - textEnd) / layout.memoryEnterDist) : 1;
      const easedEnterRatio = Math.pow(rawEnterRatio, MEMORY_ENTER_EASE_POWER);
      setMemoryEnter(easedEnterRatio);
      setMemoryPan(0);
      setMemoryActive(true);
      setMessageActive(false);
      setMessageEnter(0);
      setQaActive(false);
      setQaCards(0);
      return;
    }

    const panEnd = enterEnd + layout.memoryPanBudget;

    if (progressY <= panEnd) {
      // フェーズC2：重なり切った後、そのまま同じ「左→右」の流れの続きとして
      // 横長キャンバスをパンし、写真を左から右へ画面内へ運んでいく。
      setMemoryEnter(1);
      const panRatio = layout.memoryPanBudget > 0 ? clamp01((progressY - enterEnd) / layout.memoryPanBudget) : 1;
      setMemoryPan(panRatio);
      setMemoryActive(true);
      setMessageActive(false);
      setMessageEnter(0);
      setQaActive(false);
      setQaCards(0);
      return;
    }

    const messageEnd = panEnd + layout.messageEnterDist;

    if (progressY <= messageEnd) {
      // フェーズD：MEMORYのパンが終端まで終わった（＝「端まで行った」）
      // 状態を土台に、ここから先のスクロールでMEMORYを画面上へ押し出し
      // ながら（setMemoryExit）、入れ替わりにMESSAGEを画面下から現す
      // （setMessageEnter）。それと同期して背景タイルが下から登り切って
      // 固定され、中央カードが上から回転しながら現れて正面中央で減速して
      // 止まる（NP-X18）。
      setMemoryEnter(1);
      setMemoryPan(1);
      setMemoryActive(true);
      setMessageActive(true);
      const messageRatio = layout.messageEnterDist > 0 ? clamp01((progressY - panEnd) / layout.messageEnterDist) : 1;
      setMemoryExit(messageRatio);
      setMessageEnter(messageRatio);
      setQaActive(false);
      setQaCards(0);
      return;
    }

    // フェーズDを終えている＝MESSAGEは完全に定位置へ収まっている。
    // ここから先（フェーズE1／E2）は、MEMORYはすでに画面外（exit=1）
    // ・MESSAGEは定位置（enter=1）のまま土台として維持し続ける。
    setMemoryEnter(1);
    setMemoryPan(1);
    setMemoryActive(true);
    setMessageActive(true);
    setMemoryExit(1);
    setMessageEnter(1);

    const qaEnterEnd = messageEnd + layout.qaEnterDist;

    if (progressY <= qaEnterEnd) {
      // フェーズE1：MESSAGE→QAの「リビール型」切り替え（PT-05）。
      // 本人指示：「PT-05のリビールをメッセージからQ&Aセクションへの
      // 移動時に適用して。messageが上の層、Q&Aがしたの層として」。
      // MESSAGEが画面いっぱいに収まった状態を土台に、ここから先の
      // スクロールでMESSAGE全体（上の層）だけが画面の上へ退場していき
      // （setMessageExit）、その下に最初から静止していたQA（下の層）が
      // 徐々に露わになる（setQaEnter。中身は「常に定位置」に固定する
      // だけで、以前のような画面下からの押し出しは行わない）。旧
      // 「プッシュ型」（MESSAGE・QA双方が同時に動いて入れ替わる）との
      // 違いはここ——動くのは上の層(MESSAGE)だけ。
      const qaRatio = layout.qaEnterDist > 0 ? clamp01((progressY - messageEnd) / layout.qaEnterDist) : 1;
      setQaActive(true);
      setMessageExit(qaRatio);
      setQaEnter(qaRatio);
      setQaCards(0);
      return;
    }

    // フェーズE2：QAが定位置に収まった後、3問ぶんを順番に送る
    // （詳細はassets/js/qa.jsのsetCards()参照）。
    setMessageExit(1);
    setQaEnter(1);
    setQaActive(true);
    const qaCardsEnd = qaEnterEnd + layout.qaCardsDist;

    if (progressY <= qaCardsEnd) {
      setQaCards(layout.qaCardsDist > 0 ? clamp01((progressY - qaEnterEnd) / layout.qaCardsDist) : 1);
      return;
    }

    const fromMeEnd = qaCardsEnd + layout.fromMeEnterDist;

    if (progressY <= fromMeEnd) {
      // フェーズF：QA→FROM MEの「アイリス」切り替え。QAが中央から円形に
      // すぼまって消えていき、その下で最初から定位置に待機している
      // FROM MEが円の外側から現れる（詳細はsetQaIris()コメント参照）。
      const fromMeRatio = layout.fromMeEnterDist > 0
        ? clamp01((progressY - qaCardsEnd) / layout.fromMeEnterDist)
        : 1;
      setQaCards(1);
      setFromMeActive(true);
      // PAGE 8（TBC画像シーン）の巨大画像のデコードを、FROM MEに入った
      // 時点でもう先読みし始めておく（詳細はwarmUpTbcSceneImages()
      // コメント参照）。実際にPAGE 8が必要になるフェーズHまでまだ
      // フェーズF残り＋フェーズF2（滞在区間）＋フェーズG（ズーム＋
      // フェード）ぶんのスクロール距離があるため、十分な先読み時間を
      // 確保できる。
      warmUpTbcSceneImages();
      // アイリスが閉じきる（fromMeRatio=1）までは、QA自身のz-indexを
      // FROM MEより上へ一時的に引き上げておく（理由はsetQaStackAboveFromMe
      // のコメント参照）。閉じきった後は元のz-index（FROM MEより背面）へ
      // 戻し、以降はFROM MEが普通に最前面のページとして振る舞う。
      setQaStackAboveFromMe(fromMeRatio < 1);
      setQaIris(fromMeRatio);
      // 本文（1行ずつ）の登場は、アイリスがある程度開いて動画が見えて
      // からの方が落ち着いて読めるため、fromMeRatioの前半35%ぶんだけ
      // 遅らせてから開始する（0.35〜1.0を0〜1に再マッピング）。
      const textRatio = clamp01((fromMeRatio - 0.35) / 0.65);
      setFromMeReveal(textRatio);
      return;
    }

    // フェーズF終了＝FROM MEはアイリスが完全に開き切って定位置。
    setQaCards(1);
    setFromMeActive(true);
    setQaStackAboveFromMe(false);
    setQaIris(1);
    setFromMeReveal(1);

    const fromMeRestEnd = fromMeEnd + layout.fromMeRestDist;

    if (progressY <= fromMeRestEnd) {
      // フェーズF2：FROM MEで「立ち止まる」ための静止区間
      // （FROM_ME_REST_SCREENSのコメント参照）。演出としては何も
      // 動かさず、直前（フェーズF終了時点）の状態をそのまま維持する
      // だけ——ただしこの区間ぶんのスクロール距離を「消化」しないと
      // 次のフェーズGへ進めないので、結果として「FROM MEに一定量
      // 留まらないと次に進まない」という体感になる。
      return;
    }

    const tbcTextEnd = fromMeRestEnd + layout.tbcTextEnterDist;

    if (progressY <= tbcTextEnd) {
      // フェーズG：FROM ME→TBC文字ページの「PT-07 ズーム＋フェード」
      // （本人メモ「6→7 PT-07」）。FROM ME自身は動かさず定位置のまま、
      // TBC文字ページだけをズーム＋フェードで上に重ねる
      // （詳細はsetTbcTextEnter()コメント参照）。
      const tbcTextRatio = layout.tbcTextEnterDist > 0
        ? clamp01((progressY - fromMeRestEnd) / layout.tbcTextEnterDist)
        : 1;
      setTbcTextActive(true);
      setTbcTextEnter(tbcTextRatio);
      return;
    }

    // フェーズG終了＝TBC文字ページは完全に不透明・等倍で定位置。
    setTbcTextActive(true);
    setTbcTextEnter(1);

    const tbcTextRestEnd = tbcTextEnd + layout.tbcTextRestDist;

    if (progressY <= tbcTextRestEnd) {
      // フェーズG2：TBC文字ページで「立ち止まる」ための静止区間
      // （TBC_TEXT_REST_SCREENSのコメント参照）。フェーズF2と同じく
      // 演出としては何もせず、直前の状態（TBC文字ページが完全に
      // 不透明・等倍で定位置）をそのまま維持するだけ。
      return;
    }

    const tbcSplitEnd = tbcTextRestEnd + layout.tbcSplitDist;

    if (progressY <= tbcSplitEnd) {
      // フェーズH：TBC文字ページ→TBC画像シーンページの「PT-12
      // スプリット」（本人メモ「7→8 PT-12」）。TBC画像シーンページは
      // 最初から定位置で待機させておき（setTbcSceneActive(true)）、
      // TBC文字ページ自体が左右に裂けて退場することでその下から
      // 露わになる（詳細はsetTbcSplit()コメント参照）。ここがサイト
      // 最後のページなので、このフェーズが終わった後は特別な処理を
      // 挟まない（以前は末尾にrestDistぶんの余白を足していたが、開き
      // 切った後も何も起きないままさらにスクロールし続けられて
      // 「終わった感じがしない」不具合の原因になっていたため廃止。
      // 現在はこのフェーズが終わるとそのままスクロール終端になる）。
      const splitRatio = layout.tbcSplitDist > 0
        ? clamp01((progressY - tbcTextRestEnd) / layout.tbcSplitDist)
        : 1;
      setTbcSceneActive(true);
      setTbcSplit(splitRatio);
      return;
    }

    // フェーズH終了＝TBC文字ページは左右へ裂けきって退場し、TBC画像
    // シーンページ（サイト最後のページ）が完全に露わになった状態。
    setTbcSceneActive(true);
    setTbcSplit(1);
  }

  /* ==========================================================
     慣性スクロール（スクラブ追従ループ）
     window.scrollYを「目標値」、progress.currentを「実際に描画に使う値」
     として、時間ベースの指数関数で少し遅れて追従させる
     （フレームレートが変わっても体感速度が変わらない）。
  =========================================================== */

  const progress = { target: 0, current: 0 };
  let rafId = null;
  let lastFrameTime = 0;

  function tick(now) {
    const dt = Math.min(0.1, (now - lastFrameTime) / 1000); // 秒。タブ復帰直後などの極端なdtを防ぐ
    lastFrameTime = now;

    const catchUpRate = 1 - Math.exp(-dt / SCRUB_SECONDS);
    progress.current += (progress.target - progress.current) * catchUpRate;

    if (Math.abs(progress.target - progress.current) <= SETTLE_EPSILON) {
      progress.current = progress.target;
      render(progress.current);
      rafId = null;
      return;
    }

    render(progress.current);
    rafId = requestAnimationFrame(tick);
  }

  function requestTick() {
    if (rafId !== null) return;
    lastFrameTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  // ABOUT見出しの登場トリガーは、慣性スムージング後の描画値
  // (progress.current)ではなく、ここで実際のスクロール位置(scrollY＝
  // 目標値そのもの)を見て判定する。
  // ※本人指摘の不具合「スクロールで上に戻るとABOUTの見出しが消えてる
  // ことがある」の原因：以前はmaybeFireHeadingIntro()をrender()経由
  // （＝慣性スムージングで遅れて追従するprogress.current）でしか
  // 呼んでいなかった。revealDist（サークルが開き切る位置）ぎりぎり
  // 手前まで一気にスクロールしてすぐ上へ戻すと、progress.currentが
  // 指数関数で遅れて追いかけている最中に目標(target)が下がって
  // しまい、一度もrevealDistを実際に超えないまま戻っていくケースが
  // あった——見た目上はサークルがほぼ開き切って見える（ratioが1に近い）
  // のに、見出しの登場演出だけは一生発火しない（headingIntroFiredが
  // 立たない）という状態になっていた。
  // 修正：スクロールイベントで確定するその瞬間の実スクロール位置
  // (scrollY)がrevealDistを超えた「事実」があれば、スムージングの
  // 追従を待たずその場で即座にトリガーする。これなら描画が遅れて
  // 追従している途中でユーザーが上へ戻しても、見出しは確実に一度は
  // 現れる（＝以後は常に表示された状態のまま）。
  function setTarget(scrollY, { instant = false } = {}) {
    progress.target = scrollY;
    if (scrollY > layout.revealDist) {
      maybeFireHeadingIntro(1);
    }
    if (instant || reduceMotion) {
      progress.current = scrollY;
      render(progress.current);
      return;
    }
    requestTick();
  }

  // レイアウトを測り直しつつ、今のスクロール比率をできるだけ保つ
  // （リサイズ時と同じやり方）。measureLayout()はscrollStageの高さや
  // layout.headingRestShiftなど「今の実測値」に依存する値を再計算する
  // ので、それらが変わり得るタイミング（リサイズ、後述のWebフォント
  // 読み込み完了など）で呼ぶ。
  function remeasureAndPreserveScroll() {
    const prevMax = scrollStage.offsetHeight - window.innerHeight;
    const prevRatio = prevMax > 0 ? window.scrollY / prevMax : 0;

    measureLayout();

    const nextMax = scrollStage.offsetHeight - window.innerHeight;
    const nextScrollY = prevRatio * nextMax;
    window.scrollTo(0, nextScrollY);
    setTarget(nextScrollY, { instant: true });
  }

  /* ==========================================================
     初期化 / イベント配線
  =========================================================== */

  measureLayout();
  setTarget(window.scrollY, { instant: true });

  window.addEventListener(
    'scroll',
    () => setTarget(window.scrollY),
    { passive: true }
  );

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(remeasureAndPreserveScroll, 150);
  });

  // ABOUT見出しと本文の間の余白（GAP_PX）が「無くなっていることがある」
  // 不具合への対応。
  // ※本人指摘：「見出しの余白がなくなってたからさっきまでの余白と
  // 同じくらい見出しと本文の隙間空けといて」
  // 原因：見出しの静止位置(layout.headingRestShift)は
  // measureHeadingRestShift()が.about__arc-sub（見出し）の実際の
  // 描画サイズを`getBoundingClientRect()`で測って算出している。ところが
  // 見出しのフォント「Dela Gothic One」はGoogle Fontsから
  // `display=swap`で読み込んでいる（index.html）——つまりフォント本体の
  // ダウンロードが終わるまでは代替フォントで先に表示され、届いた
  // 時点で実際のフォントに“差し替わる”(FOUT)。measureLayout()は
  // スクリプト読み込み時に1回しか呼ばれないため、代替フォントでの
  // （実際のDela Gothic Oneより小さい／大きい）サイズを基準に
  // headingRestShiftを計算してしまい、後からフォントが差し替わって
  // 見出しの実際のサイズが変わっても、一度計算した隙間の値はそのまま
  // 更新されずに残ってしまっていた（＝見出しが本文と重なる／余白が
  // 消えて見える原因）。
  // 対策：標準のFont Loading API（document.fonts.ready）で「使用中の
  // フォントの読み込みがすべて完了した」タイミングを検知し、その時点で
  // レイアウトを測り直す。スクロール比率を保ったまま再計測する
  // remeasureAndPreserveScroll()を使うので、フォント読み込みが
  // 読者の操作と重なっても位置が飛ばない。
  if (window.document && document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      remeasureAndPreserveScroll();
    }).catch(() => {}); // フォント読み込み監視自体に失敗しても致命的ではないので無視
  }

  // 下層ページ（メッセージ一覧、message-list.html）の「戻る」ボタンから
  // 帰ってきた際に使う入口。MESSAGEセクションの入場が完全に終わって
  // カードが静止した直後（＝QAへ押し出される直前の静止状態）の
  // scrollYまで、補間アニメーションなしで一気に合わせる。
  // applyScrollPhases()内のbendEnd/textEnd/enterEnd/panEndと全く同じ式を
  // layout（このIIFEのクロージャ変数）から算出しているだけなので、
  // 各フェーズの距離を決めている定数（MESSAGE_ENTER_SCREENS等）を
  // 変えてもここを直す必要はない。
  // サークルマスクで画面が覆われている間（assets/js/page-transition.js）
  // に呼ぶ想定：ユーザーからは一瞬でMESSAGEセクションに着地したように
  // 見える。
  window.__scrollToMessageRestY = function scrollToMessageRestY() {
    const bendEnd = layout.revealDist + layout.bendDist;
    const textEnd = bendEnd + layout.textScrollBudget;
    const enterEnd = textEnd + layout.memoryEnterDist;
    const panEnd = enterEnd + layout.memoryPanBudget;
    const messageRestY = panEnd + layout.messageEnterDist;
    window.scrollTo(0, messageRestY);
    setTarget(messageRestY, { instant: true });
    return messageRestY;
  };

  // MEMORY下層ページ（memory-list.html）の「MEMORYに戻る」から帰ってきた
  // 際に使う入口。上の__scrollToMessageRestYと同じ考え方で、MEMORYの
  // パンが右端まで終わった位置（＝「もっと思い出を振り返る」ボタンが
  // 見えている、MESSAGEへ押し出される直前の状態）へ補間なしで合わせる。
  // 暗幕で画面が覆われている間（index.html末尾のrevealFromMemory）に呼ぶ。
  window.__scrollToMemoryRestY = function scrollToMemoryRestY() {
    const bendEnd = layout.revealDist + layout.bendDist;
    const textEnd = bendEnd + layout.textScrollBudget;
    const enterEnd = textEnd + layout.memoryEnterDist;
    const panEnd = enterEnd + layout.memoryPanBudget;
    window.scrollTo(0, panEnd);
    setTarget(panEnd, { instant: true });
    return panEnd;
  };

  // 最後のページ（TO BE CONTINUEDシーン）の「TOPへ戻る」ボタン
  // （assets/js/tbc-top-button.js）から使う入口。上の
  // __scrollToMessageRestY と全く同じ理由・同じ使い方で、scrollY=0
  // （FV先頭）へ補間アニメーションなしで一気に合わせる。
  // ※本人指摘「トップに戻る時に全部のページをみながら戻ってる感じ」の
  // 直接の原因：window.scrollTo()で実スクロール位置(scrollY)自体は
  // 一瞬で0になっても、pager.js側のprogress.currentは上のtick()が
  // 指数関数で遅れて追いかける作りのため、末尾（tbcSplitEnd付近）から
  // 0までの全フェーズを数百ms〜1秒以上かけて描画しながら「見た目上」
  // 巻き戻ってしまっていた（scrollToの引数をinstant/behavior:'auto'に
  // しても、これはブラウザのスクロール自体の話でありprogress.current
  // の遅延追従とは別問題なので効果がなかった）。
  // setTarget(0, {instant:true})でprogress.currentもその場で0へ
  // 同期することで、描画も含めて本当に「一瞬でTOPの状態になる」。
  // サークルマスクで画面が覆われている間（tbc-top-button.js）に
  // 呼ぶ想定：ユーザーからは中間フェーズが一切見えない。
  window.__scrollToTopInstant = function scrollToTopInstant() {
    window.scrollTo(0, 0);
    setTarget(0, { instant: true });
  };
})();

/* ==========================================================
   Q&A（5ページ目）

   もともと本人がcodexで別ファイル(qa.html)として試作していたものを、
   このサイト本体（index.html / pager.js）に統合し直したもの。

   統合にあたって直したポイント：
   1) 独自にwindow.scrollYを購読し、かつCSS側に短い
      `transition: opacity .12s linear, transform .12s linear` を
      持たせていた（＝pager.js側の慣性スムージングと、CSS transitionの
      遅延が二重にかかって、速くスクロールするともたついて見える構成
      だった）。ここではCSS transitionを一切使わず、pager.jsが
      慣性スムージング済みのprogressYから算出した連続比率(ratio)を
      window.qaSection.setCards(ratio)経由で毎フレーム受け取り、
      その場でスタイルを確定させるだけにしている（MESSAGEカードの
      チルト演出を除く、このサイトの他の演出全部と同じ設計方針）。
   2) 質問→回答→ステッカーの「ポン、ポン、ポン」というポップインの
      間隔と、次の問いへ移る「退場」のタイミングを、下のTIMELINEに
      一本化して設計し直した（元は退場が全体の最後10%だけで急に
      消えていた／登場の緩和もCSS transition頼みだったのをやめ、
      easeOutBackで「弾む」量そのものをJS側で計算している）。

   pager.js側との橋渡し：
   - setEnter(): MESSAGE→QAの切り替え。本人指示でプッシュ型から
     PT-05「リビール」型に変更（MESSAGEが上の層、QAが下の層）。
     QA側は動かず常に定位置のまま——MESSAGEだけが画面の外へ退場して
     いくことで、下に元からいたQAが露わになる。
   - setCards(ratio): QAが定位置に収まった後、3問ぶんを順番に送る
     全体比率(0〜1)。
=========================================================== */
(() => {
  const stage = document.getElementById('qaStage');
  const scene = document.getElementById('qaScene');
  const questionEl = document.getElementById('qaQuestion');
  const answerEl = document.getElementById('qaAnswer');
  const questionText = document.getElementById('qaQuestionText');
  const answerText = document.getElementById('qaAnswerText');
  const stickerElA = document.getElementById('qaStickerA');
  const stickerElB = document.getElementById('qaStickerB');
  const dots = Array.from(document.querySelectorAll('.qa__progress-dot'));
  if (!stage || !scene || !questionEl || !answerEl) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 3問ぶんのQ&A本文とステッカー。pager.js側のQA_ITEM_COUNTと
  // 件数を必ず一致させること（スクロール距離の配分に使われるため）。
  // ステッカーは本人から送付された6枚の写真ステッカーを2枚1組で
  // 各問いに割り当てている（1問目=1,2枚目 / 2問目=3,4枚目 /
  // 3問目=5,6枚目、という単純な順番割り当て。質問内容との対応が
  // 指定されているわけではないので、差し替えたい組み合わせが
  // あれば教えてもらえれば入れ替える）。
  // ※パスは assets/img/qa_photo1.png 〜 6.png（assets/img/直下）。
  // 以前は assets/img/qa/ というサブフォルダの中に置いていたが、本人が
  // ファイル整理でサブフォルダを使わずassets/img/直下へ移動したため、
  // それに合わせてパスを変更した（本人指摘：「写真のファイル移動した
  // から指定し直さないといけないかも。現状ステッカー見えてないから
  // 多分それが原因」——実機のフォルダを確認したところその通りだった）。
  // ============================================================
  // ▼▼▼ ステッカー位置の手動調整はここだけ触ればOK ▼▼▼
  //
  // 本人がコードに直接数値を書いて調整したいとのことなので、質問文や
  // 画像パスと分けて、ここに1箇所へまとめてある。QA_STICKER_POSITIONSの
  // 配列インデックス[0]=Q1、[1]=Q2、[2]=Q3が、そのまま下のitems配列の
  // 質問順に対応する。
  //
  // 【書き方】
  //   a: ステッカーA（左上寄りに置くことを想定）
  //   b: ステッカーB（右下寄りに置くことを想定）
  //   それぞれ { top, right, bottom, left, rot } の5項目を指定する。
  //
  //   - 左上を基準に置きたいとき → top と left に数値、right と bottom は
  //     'auto' のまま。
  //   - 右下を基準に置きたいとき → bottom と right に数値、top と left は
  //     'auto' のまま。
  //   - 4辺すべてに数値を入れると位置がおかしくなるので、必ず2辺だけ
  //     数値・残り2辺は'auto'にすること。
  //   - 数値は %（Q&Aの表示エリア全体を基準にした割合）。例えば
  //     top:'2%' は上端から2%の位置。値を大きくするほど中央へ寄る。
  //   - rot は傾き（度）。プラスで時計回り、マイナスで反時計回り。
  //
  //   ブラウザでindex.htmlを開いてQ&Aセクションまでスクロールすれば
  //   その場で見た目を確認できる（保存してリロードするだけで反映）。
  //
  // 【由来】もともとQ1・Q2はFigmaのカンプ座標を目視で近似した値だったが、
  // 本人指摘「Q&AだけどPC版はもっと横に広く使うか」でQ・Aの吹き出しを
  // 「縦積み」から「横並び」へ配置を変更した
  // （assets/css/style.css .qa__bubble--question／--answer参照）ため、
  // この配置に合わせてステッカー位置もすべて引き直した。
  // ※続けて本人指摘「Qのアイコンと吹き出しを右側に持ってきて、Aの
  // アイコンと吹き出しを左にしたい。吹き出しが重ならないように、Y軸も
  // 多少調整して」を受けて、左右を入れ替え（質問=右寄りlelft:72%／
  // 回答=左寄りleft:25%）、かつ上下も揃えず少しずらした
  // （回答top:36%／質問top:48%）。横並び＋上下ずらしレイアウトでは、
  // 2つの吹き出しは画面の中央帯に収まり、Q/Aアイコンのラベルもその
  // 隙間側（吹き出し同士が向き合う内側）に寄るため、外側の四隅
  // 　・左上（answer吹き出しの左上）
  // 　・右下（question吹き出しの右下）
  // 　あるいはその対角（右上／左下）
  // が常に空く（上下をずらしたぶん、以前より隙間には余裕がある）。
  // スマホ版は横並びにする余地が無いため縦積み（本人指摘「スマホ版は
  // 縦に長いから縦に並べようか」）のまま据え置いており（style.css側の
  // @media (max-width:768px)でtop/leftを上書き）、縦積みレイアウトでも
  // 同じ「四隅寄り」の割合（%）は変わらず安全な位置になるよう、PC・
  // スマホ両方でこの1セットの数値を共用している。
  //
  // Q3（node 878:14942）もFigma MCPのレート制限で未取得のままだが、
  // 見た目の一貫性を優先してQ1と近い数値で固定した（nullに戻せば
  // 下のsetCards()が従来どおりランダム配置にフォールバックする）。
  // ※本人指摘「QとAの吹き出しとアイコンのY方向の位置を変えたい。Qの
  // セットの方がAよりも若干高い位置にくるようにしたい。ステッカーも
  // 適宜移動量に合わせて配置して」を受けて、質問(question)をtop:48%→40%
  // （8ポイント上へ）・回答(answer)をtop:36%→46%（10ポイント下へ）
  // 動かした（assets/css/style.css側）。
  // 当初は「半分の量だけ追従」させる案で調整したが、Playwrightで全項目を
  // 実測したところ、既存の見出し(.qa__heading)・Q/Aラベル・吹き出し本体
  // との重なりが複数見つかった（Q1/Q3のステッカーaがAラベル・answer
  // 吹き出しと重なる、Q2のステッカーaが見出し・Qラベル・question吹き出し
  // と重なる、Q2のステッカーbがanswer吹き出しと重なる）。そのため、
  // 半分追従という考え方をやめ、実測した各要素の矩形（1440×900基準）を
  // 避けられる位置へ組み直した：
  // 　・左上の空き（x:0〜195, y:0〜378付近。Aラベル/answer吹き出しの
  // 　　開始よりも上）→ ステッカーaをここに寄せる項目はtopを4%まで
  // 　　浅くして見出し・ラベル・吹き出しの上を通す。
  // 　・右下の空き（x:1128〜1440, y:521〜900付近。question吹き出しの
  // 　　下端より下）→ ステッカーをここに寄せる項目はbottom基準に変更。
  // 　・見出し(.qa__heading)は左右330〜1110pxに及ぶため、左上に置く
  // 　　ステッカーは横幅が大きい項目ほど見出しの左端(330px)へ食い込み
  // 　　やすい。実測して食い込みが出た項目はleftをマイナス値まで
  // 　　振って見出しより左（0〜330px手前）に収めている。
  const QA_STICKER_POSITIONS = [
    { // Q1: 出会ったきっかけ／ステッカーaは左上（見出しの下を素通りする
      // 浅いtopへ）、bは右下のまま（重なりなし・変更不要だった）
      a: { top: '4%', right: 'auto', bottom: 'auto', left: '3%', rot: '-6deg' },
      b: { top: 'auto', right: '3%', bottom: '13%', left: 'auto', rot: '8deg' },
    },
    { // Q2: プロポーズ／ステッカーaは右上→右下（question吹き出し・
      // 見出し・Qラベルの下を抜けた位置）、bは左下→左上
      // （answer吹き出しの上、見出しの左を避けるためleftをマイナスに）
      a: { top: 'auto', right: '3%', bottom: '3%', left: 'auto', rot: '7deg' },
      b: { top: '4%', right: 'auto', bottom: 'auto', left: '-5%', rot: '-9deg' },
    },
    { // Q3: 何年目か／Q1と同じ左上・右下だが、このステッカーaは横幅が
      // 大きい画像で見出しの左端に食い込んだため、leftをマイナスへ
      // 振って見出しより左に収めた
      a: { top: '4%', right: 'auto', bottom: 'auto', left: '-8%', rot: '-7deg' },
      b: { top: 'auto', right: '4%', bottom: '12%', left: 'auto', rot: '9deg' },
    },
  ];
  // ▲▲▲ ステッカー位置の手動調整はここまで ▲▲▲
  // ============================================================

  // 3問ぶんのQ&A本文とステッカー。pager.js側のQA_ITEM_COUNTと
  // 件数を必ず一致させること（スクロール距離の配分に使われるため）。
  // ステッカーは本人から送付された6枚の写真ステッカーを2枚1組で
  // 各問いに割り当てている（1問目=1,2枚目 / 2問目=3,4枚目 /
  // 3問目=5,6枚目、という単純な順番割り当て。質問内容との対応が
  // 指定されているわけではないので、差し替えたい組み合わせが
  // あれば教えてもらえれば入れ替える）。
  // ※パスは assets/img/qa_photo1.png 〜 6.png（assets/img/直下）。
  // 以前は assets/img/qa/ というサブフォルダの中に置いていたが、本人が
  // ファイル整理でサブフォルダを使わずassets/img/直下へ移動したため、
  // それに合わせてパスを変更した（本人指摘：「写真のファイル移動した
  // から指定し直さないといけないかも。現状ステッカー見えてないから
  // 多分それが原因」——実機のフォルダを確認したところその通りだった）。
  // stickerPositionは上のQA_STICKER_POSITIONS[index]をそのまま参照
  // しているだけ（値そのものは上のブロックで編集すること）。
  // 本人から実際のQ&A回答が届いたため、ダミー文言から本番の質問・
  // 回答に差し替え済み。質問は元のダミーより短い（10〜20字程度）ので
  // 質問側の吹き出しサイズは変更していないが、回答は1〜3文の長文
  // （90〜110字程度）になったため、.qa__bubble--answer.is-long
  // （answer.length > 22で自動的に付与される）のサイズを本文に合わせて
  // 拡張した（assets/css/style.css側。本人指示「Qの位置はあんまり
  // 崩したくない」を受けて、質問側の吹き出し・アイコン位置(top:34%等)
  // は一切変更していない）。
  // ※本人指摘「吹き出しの中の文章の段落の折り返し位置が気になる」を
  // 受けて、Q1・Q3の質問文には指定どおりの位置に改行(\n)を入れている。
  // 自動折り返し任せだと吹き出しの幅次第で意図しない位置で切れて
  // しまうため、ここで明示的に改行し、CSS側
  // （.qa__bubble-text { white-space: pre-line; }）でその改行を
  // そのまま見た目に反映させている（pre-lineは通常の空白の連続は
  // 詰めたまま、\nだけを改行として扱う）。
  const items = [
    {
      question: '2人が出会ったきっかけは\nなんですか？',
      answer: '友達であり幼なじみの希美が「一緒にスノボ行ける人いない？」と探していて、そこにたまたま反応したのがきっかけです！まさかスノボ仲間を探していただけなのに、そのまま結婚相手まで見つかるとは思っていませんでした（笑）',
      sticker: ['assets/img/qa_photo1.png', 'assets/img/qa_photo2.png'],
      stickerPosition: QA_STICKER_POSITIONS[0],
    },
    {
      question: 'プロポーズのエピソードを聞きたいです！',
      answer: '長崎のハウステンボスにある観覧車の頂上でプロポーズしてもらいました！景色もきれいでしたが、それ以上に過去一レベルで緊張している姿のほうが印象に残っています（笑）今となっては、それも含めて忘れられない思い出です！',
      sticker: ['assets/img/qa_photo3.png', 'assets/img/qa_photo4.png'],
      stickerPosition: QA_STICKER_POSITIONS[1],
    },
    {
      question: '結婚式を迎えた今、2人は\n何年目ですか？',
      answer: '付き合って4年半になります！振り返るとあっという間でしたが、4年半も一緒にいるとだいぶお互いの扱いにも慣れてきました（笑）これからは夫婦として、今まで以上に楽しく過ごしていきたいです！',
      sticker: ['assets/img/qa_photo5.png', 'assets/img/qa_photo6.png'],
      stickerPosition: QA_STICKER_POSITIONS[2],
    },
  ];

  // 1カードぶん(local: 0〜1)のタイムライン。質問→回答→ステッカーの
  // 順に少しずつ重なりながらポップインするカスケードにして、
  // その後は十分な「読む間」を置いてから、まとめてフェード＋
  // わずかに縮小しながら退場する（元の実装は退場が全体の最後10%
  // しかなく急に消えていたので、18%に広げて余裕を持たせた）。
  const TIMELINE = {
    questionStart: 0, questionDuration: 0.22,
    answerStart: 0.16, answerDuration: 0.26,
    stickerStart: 0.38, stickerDuration: 0.22,
    // 2枚目のステッカーは1枚目に少し遅れて「ポン、ポン」と
    // 追いかけるように出す（同時に出すと1枚のときより間延びして
    // 見えたため、わずかに時差を付けた）。
    stickerBStart: 0.46, stickerBDuration: 0.22,
    exitStart: 0.82, exitDuration: 0.18,
  };

  function clamp01(v) {
    return Math.min(1, Math.max(0, v));
  }

  // ステッカーの出現位置プリセット。
  // ※本人指示「ランダムを辞めたい。figmaでステッカーの位置してその
  // 座標を読み取ってもらう」を受けて、items[0]・items[1]（Q1・Q2）は
  // 上のitems配列内のstickerPositionで固定配置に切り替え済み。この
  // プリセット群は、まだFigmaデータが無いitems[2]（Q3）専用の
  // フォールバックとして残している——質問が切り替わるたびにこの中から
  // ランダムに1組選ぶ（A・Bのペア単位で選ぶことで、2枚が重なったり
  // 中央の吹き出しに被ったりしない、見た目のバランスが取れた組み合わせ
  // だけを許可している）。top/right/bottom/leftを全部指定し、使わない
  // 辺は明示的に'auto'にして前回選んだプリセットの値が残らないようにする。
  //
  // ※本人指摘：「ステッカーの登場は一緒に出る二つの位置が近くて面白みが
  // ない箇所が2個目3個目に見られるのでステッカー同士離してランダム感を
  // 意識して」。旧バージョンはA・Bを同じ角（右上同士、左上同士など）に
  // 近接配置するプリセットが混ざっており、それが「近い」印象の原因
  // だった。全プリセットを、AとBが必ず画面の対角（もしくは離れた辺）に
  // 来るよう組み直した——毎回どのプリセットが選ばれても、2枚が
  // はっきり離れて見えるようにしている。
  // Q/Aラベル（吹き出しの角に乗る丸アイコン）と、実機検証で衝突する
  // 組み合わせが見つかったため（本人指摘の「ステッカー同士離して」対応で
  // 一旦「中段寄り」の位置も混ぜていたところ、Qラベルの右肩・Aラベルの
  // 左下あたりとちょうど重なるケースがあった）、全プリセットを「画面の
  // 四隅ギリギリ（コンテナ端から1〜3%）」だけに絞り込んだ。四隅は
  // ラベルの横位置（Qラベルは中央よりやや右寄り、Aラベルは中央よりやや
  // 左寄り、どちらも画面の本当の端ではない）から確実に離れているため、
  // A・Bをどの対角の組み合わせにしても、また写真ごとに実際のサイズが
  // 変わっても（アスペクト比違いや回転で見かけの占有範囲が伸び縮み
  // しても）ラベルとは重ならない。见た目の単調さは、A/Bを入れ替えたり
  // （右上⇄左下・左上⇄右下）、上下どちらを先に置くか（bottom基準/top
  // 基準）や回転角を変えることで確保している（Playwrightで6枚の写真×
  // 3カードぶんを総当たりし、ラベルとステッカーの矩形が重ならないことを
  // 確認済み）。
  const STICKER_POSITION_PRESETS = [
    // 右上 ⇄ 左下（対角）
    { a: { top: '3%', right: '2%', bottom: 'auto', left: 'auto', rot: '6deg' },
      b: { top: 'auto', right: 'auto', bottom: '4%', left: '1%', rot: '-9deg' } },
    // 左上 ⇄ 右下（対角、上の鏡写し）
    { a: { top: '3%', right: 'auto', bottom: 'auto', left: '2%', rot: '-7deg' },
      b: { top: 'auto', right: '1%', bottom: '4%', left: 'auto', rot: '10deg' } },
    // 右上（角度違い） ⇄ 左下（角度違い）
    { a: { top: '2%', right: '3%', bottom: 'auto', left: 'auto', rot: '-6deg' },
      b: { top: 'auto', right: 'auto', bottom: '3%', left: '2%', rot: '8deg' } },
    // 左上（角度違い） ⇄ 右下（角度違い）
    { a: { top: '2%', right: 'auto', bottom: 'auto', left: '3%', rot: '7deg' },
      b: { top: 'auto', right: '2%', bottom: '3%', left: 'auto', rot: '-10deg' } },
    // 左下（Aが下） ⇄ 右上（Bが上）——上下を入れ替えたバリエーション
    { a: { top: 'auto', right: 'auto', bottom: '3%', left: '2%', rot: '-8deg' },
      b: { top: '2%', right: '2%', bottom: 'auto', left: 'auto', rot: '9deg' } },
    // 右下（Aが下） ⇄ 左上（Bが上）——上下を入れ替えたバリエーション
    { a: { top: 'auto', right: '2%', bottom: '3%', left: 'auto', rot: '10deg' },
      b: { top: '3%', right: 'auto', bottom: 'auto', left: '2%', rot: '-6deg' } },
  ];

  let lastPositionPresetIndex = -1;

  // 前回と同じプリセットを連続で選ばないようにしつつランダムに1つ選ぶ
  // （3問しかないので、完全ランダムだと「毎回同じ位置」に見える確率が
  // 意外と高いため）。
  function pickStickerPositionPreset() {
    if (STICKER_POSITION_PRESETS.length <= 1) return STICKER_POSITION_PRESETS[0];
    let next = lastPositionPresetIndex;
    while (next === lastPositionPresetIndex) {
      next = Math.floor(Math.random() * STICKER_POSITION_PRESETS.length);
    }
    lastPositionPresetIndex = next;
    return STICKER_POSITION_PRESETS[next];
  }

  function applyStickerPosition(el, prefix, pos) {
    if (!el) return;
    scene.style.setProperty(`--qa-${prefix}-top`, pos.top);
    scene.style.setProperty(`--qa-${prefix}-right`, pos.right);
    scene.style.setProperty(`--qa-${prefix}-bottom`, pos.bottom);
    scene.style.setProperty(`--qa-${prefix}-left`, pos.left);
    scene.style.setProperty(`--qa-${prefix}-rot`, pos.rot);
  }

  // 「ポン」と弾むポップインの緩和関数(easeOutBack)。時間ベースのCSS
  // transitionではなく、スクロール量の連続関数としてここで計算する
  // ので、スクロールを戻すと同じ道を逆再生して自然に戻っていく
  // （TY-15／about-arc.jsの弧変形と同じ設計方針：「しきい値越えの
  // 一度きりのトリガーではなく毎フレーム位置から再計算する連続関数」）。
  function easeOutBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    const x = clamp01(t);
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  }

  function easeOutCubic(t) {
    const x = clamp01(t);
    return 1 - Math.pow(1 - x, 3);
  }

  // フェーズE1：MESSAGE→QAの切り替え。以前はここで.qa__stageを画面下
  // (translateY 100%)から定位置(0%)へ動かす「プッシュ型」だったが、
  // 本人指示（「PT-05のリビールをメッセージからQ&Aセクションへの移動時
  // に適用して。messageが上の層、Q&Aがしたの層として」）を受けて
  // 「リビール型」に作り直した。リビールでは、下の層(QA)は動かさず
  // 最初から定位置に静止させておき、上の層(MESSAGE)だけが画面の外へ
  // スライドして退場することで、その下に元から居たQAが徐々に露わに
  // なる——プッシュ（両者が同時に動いて入れ替わる）とは異なり、
  // 「動くのは上の層だけ」というのがリビールの肝。そのためこの関数は
  // ratioを受け取っても何もせず、.qa__stageは常に定位置（transform無し）
  // のままにしてある（引数は既存の呼び出し元との互換のために残して
  // いるだけで、実質的には「常にsetEnter(1)相当」の状態）。
  function setEnter() {
    stage.style.transform = '';
  }

  // Q&A→FROM MEの切り替え（旧版：単純な押し出し）。現在はsetIris()に
  // 置き換わって未使用だが、参考として残しておく。
  function setExit(ratio) {
    const r = clamp01(ratio);
    stage.style.transform = r <= 0 ? '' : `translateY(${-r * 100}%)`;
  }

  // カメラの絞り（アイリス）が閉じるように、中央から円形にQA全体を
  // すぼめて消す。QA→FROM MEはMEMORY→MESSAGE→QAまでの「プッシュ型」
  // (translateY)の切り替えと違い、賑やかな黄色いQAから落ち着いた
  // 動画＋メッセージへとトーンが大きく変わるため、あえて質感の違う
  // 演出にして「ここでページの雰囲気が変わる」ことを演出そのもので
  // 伝える狙い（本人指示：デザインが大きく変わるので演出を工夫して
  // ほしい）。FROM ME側は最初から定位置・等倍で待機しているだけ
  // （pager.js側のsetFromMeActive参照）なので、QAがすぼまって
  // 消えていく円の外側から自然に現れて見える——FVを開いたときの
  // 円形マスク演出（サークルリビール）と対になる、締めくくりの
  // 「円形ワイプ」でもある。
  // clip-pathの半径は%ではなくvmax基準の実寸で指定している（%指定だと
  // 基準ボックスの縦横比によって解決のされ方が変わり、画面のアス比
  // 次第で「完全に覆いきる半径」が変わってしまうため。vmaxなら
  // 縦横どちらが長くても対角線を確実に超える大きさを一つの値で保証できる）。
  const IRIS_MAX_VMAX = 85; // 画面のどんなアス比でも対角線を覆いきる半径
  function setIris(ratio) {
    const r = clamp01(ratio);
    if (r <= 0) {
      stage.style.clipPath = '';
      stage.style.transform = '';
      return;
    }
    const radius = (1 - r) * IRIS_MAX_VMAX;
    stage.style.clipPath = `circle(${radius}vmax at 50% 50%)`;
    // 円がすぼまっていくのに合わせて、ほんの少しだけ中心へ縮む
    // （絞りが閉じる時の「奥へ吸い込まれる」ような感覚を強める）。
    stage.style.transform = `scale(${(1 - r * 0.1).toFixed(3)})`;
  }

  let activeIndex = -1;

  // フェーズE2：QAが定位置に収まった後、3問ぶんを順番に送る。
  // ratio(0〜1)をitems.length倍して「今どの問いか(index)」と
  // 「その問いの中でのローカル比率(local, 0〜1)」に分解する。
  function setCards(ratio) {
    const overall = clamp01(ratio);
    const scaled = overall * items.length;
    const index = Math.min(items.length - 1, Math.floor(scaled));
    const local = scaled >= items.length ? 1 : scaled - index;

    if (activeIndex !== index) {
      questionText.textContent = items[index].question;
      answerText.textContent = items[index].answer;
      answerEl.classList.toggle('is-long', items[index].answer.length > 22);
      if (stickerElA) stickerElA.src = items[index].sticker[0];
      if (stickerElB) stickerElB.src = items[index].sticker[1];
      // items[0]・items[1]（Q1・Q2）はFigmaから読み取った固定位置を
      // そのまま使う。まだFigmaデータが無いitems[2]（Q3）だけ、従来の
      // ランダムプリセット選択にフォールバックする。
      const fixedPosition = items[index].stickerPosition;
      const preset = fixedPosition || pickStickerPositionPreset();
      applyStickerPosition(stickerElA, 'sticker-a', preset.a);
      applyStickerPosition(stickerElB, 'sticker-b', preset.b);
      dots.forEach((dot, i) => dot.classList.toggle('is-active', i === index));
      activeIndex = index;
    }

    if (reduceMotion) {
      scene.style.setProperty('--qa-question-opacity', '1');
      scene.style.setProperty('--qa-question-scale', '1');
      scene.style.setProperty('--qa-question-y', '0vh');
      scene.style.setProperty('--qa-answer-opacity', '1');
      scene.style.setProperty('--qa-answer-scale', '1');
      scene.style.setProperty('--qa-answer-y', '0vh');
      scene.style.setProperty('--qa-sticker-a-opacity', '1');
      scene.style.setProperty('--qa-sticker-a-scale', '1');
      scene.style.setProperty('--qa-sticker-b-opacity', '1');
      scene.style.setProperty('--qa-sticker-b-scale', '1');
      return;
    }

    const qIn = clamp01((local - TIMELINE.questionStart) / TIMELINE.questionDuration);
    const aIn = clamp01((local - TIMELINE.answerStart) / TIMELINE.answerDuration);
    const sIn = clamp01((local - TIMELINE.stickerStart) / TIMELINE.stickerDuration);
    const sBIn = clamp01((local - TIMELINE.stickerBStart) / TIMELINE.stickerBDuration);
    const exit = clamp01((local - TIMELINE.exitStart) / TIMELINE.exitDuration);
    const exitEase = easeOutCubic(exit);

    const qPop = easeOutBack(qIn);
    const aPop = easeOutBack(aIn);
    const sPop = easeOutBack(sIn);
    const sBPop = easeOutBack(sBIn);

    // 退場：フェードしつつ、わずかに上へ抜けながら少し縮む
    // （scaleは「ポップインの最終スケール」にさらに(1-exitEase*0.12)を
    // 掛けるだけなので、退場の入りと次カードの登場が滑らかにつながる）。
    scene.style.setProperty('--qa-question-opacity', String(Math.min(1, qIn * 1.6) * (1 - exitEase)));
    scene.style.setProperty('--qa-question-scale', ((0.7 + qPop * 0.3) * (1 - exitEase * 0.12)).toFixed(3));
    scene.style.setProperty('--qa-question-y', `${(1 - Math.min(1, qIn * 1.3)) * 6 - exitEase * 4}vh`);

    scene.style.setProperty('--qa-answer-opacity', String(Math.min(1, aIn * 1.6) * (1 - exitEase)));
    scene.style.setProperty('--qa-answer-scale', ((0.7 + aPop * 0.3) * (1 - exitEase * 0.12)).toFixed(3));
    scene.style.setProperty('--qa-answer-y', `${(1 - Math.min(1, aIn * 1.3)) * 6 - exitEase * 4}vh`);

    scene.style.setProperty('--qa-sticker-a-opacity', String(Math.min(1, sIn * 1.6) * (1 - exitEase)));
    scene.style.setProperty('--qa-sticker-a-scale', ((0.35 + sPop * 0.65) * (1 - exitEase * 0.12)).toFixed(3));

    scene.style.setProperty('--qa-sticker-b-opacity', String(Math.min(1, sBIn * 1.6) * (1 - exitEase)));
    scene.style.setProperty('--qa-sticker-b-scale', ((0.35 + sBPop * 0.65) * (1 - exitEase * 0.12)).toFixed(3));
  }

  window.qaSection = { setEnter, setExit, setIris, setCards, itemCount: items.length };
})();

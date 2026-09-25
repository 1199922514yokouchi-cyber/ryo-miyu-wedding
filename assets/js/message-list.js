/* ==========================================================
   MESSAGE 下層ページ（メッセージ一覧）のロジック。

   参考カタログ（message-interaction-catalog-2.html）のパターンA
   「散らばりカード × 読む帯」の挙動をそのまま踏襲：
     - カード一覧をクリック → 中央の読む帯（横スクロール）が開く
     - 開いた状態でホイール（縦）/ 横スクロール / 下の名前チップ /
       ← →キー で次のメッセージへ
     - 背景クリック・「閉じる」ボタン・Escキーで一覧へ戻る

   ▼本番データについて
   - MESSAGES配列は本番のメッセージ（友人12件＋家族・親族10件、計22件）。
     「結婚祝いメッセージ一覧」として本人から共有された内容をそのまま
     転記している（改行もそのまま。表示側は白空白をpre-lineにして
     改行を反映している＝assets/css/message-list.cssの
     .mlist__reading-body参照）。
   - photo: true のエントリは photoSrc に指定した画像を表示する。
     画像が見つからない間は点線のプレースホルダー表示になるので、
     実ファイルを assets/img/message-list/ 以下に置いて photoSrc の
     パスを合わせること。
   - video: true のエントリ（本人指示「この画像（実体は動画）を
     溝口彩乃様からのカードに表示できるようにしたい」への対応。
     添付ファイル名`MEMORY_PHOT_ayano3.mp4`から溝口彩乃様宛の
     メモリー動画と判断）は videoSrc に指定した動画を表示する
     （assets/video/message-list/mlist-ayano.mp4、音声トラック無しの
     5秒ループ想定でmuted loop autoplayにしている）。videoPoster は
     動画の1フレーム目を書き出した静止画（assets/img/message-list/
     mlist-ayano-poster.jpg）で、自動再生がブロックされる環境や
     読み込み中でも枠が真っ黒にならないようposter属性に指定している。
     当初は美結様お母様のメッセージに写真を仮で割り当てていたが、
     本人指示「溝口彩乃様以外は写真とかないので修正しといて」により
     撤回し、通常のテキストカードに戻した（実ファイルも用意されて
     いなかったプレースホルダーだったため実害なし）。

   ▼本人指摘5件への対応（このファイルの改修まとめ）
   1. 「カルーセルの構造が崩れてるかな。中央のカードだけがアクティブの
      状態になって欲しいけど、今は画面右側のカードがアクティブに
      なってる」
      → 原因はcardWidth()の実装バグだった。以前は
      `readings[0].getBoundingClientRect().width` で1枚あたりの幅を
      測っていたが、getBoundingClientRect()はCSSのtransform（paint()が
      非アクティブなカードに掛けているscale(0.94)）を反映した「見た目の
      サイズ」を返す。readings[0]（配列の先頭要素）はほとんどの場合
      アクティブではない＝0.94倍に縮んだ状態で測定されてしまい、
      本来560pxのところ約526pxという少し小さい値を「1枚分の幅」として
      使ってしまっていた。この縮んだ値でscrollLeftの目標値を
      `idx * cardWidth()`と計算していたため、開いたカードのindexが
      大きくなるほど誤差が積み重なり（例：22件中の最後のカードでは
      1枚分ズレる）、JS側は「このカードがアクティブ」と認識していても
      実際の画面中央には別のカードが来てしまっていた
      （＝「画面右側のカードがアクティブ」に見える症状と一致、
      Playwrightで実測して確認済み）。
      対処：`getBoundingClientRect().width`ではなく、CSSのtransformの
      影響を受けないレイアウト上の幅`offsetWidth`を使うよう変更。
      あわせて、gapの値もこれまで28px固定でハードコードしていたが
      （実際にはモバイルでは16pxにCSSで変更されており、ここも
      ズレの一因になっていた）、`getComputedStyle(strip).columnGap`から
      実際の値を都度取得するように変更した。
      さらに、背景の一覧グリッド側でも「開いているカードと同じ番号の
      カード」にピンクの縁取り（アクティブ表示）を付けていたが、
      これは読む帯の中央カードとは別に「もう一つのアクティブ」が
      グリッド上の別の位置（画面の端など）に出現して紛らわしかったため
      （本人の「中央のカードだけがアクティブの状態になって欲しい」という
      要望に反する）、この背景ハイライトは廃止した。
   2. 「下の名前タブだけど、ここもスクロールか、左右ボタン置いといて
      見切れてる人たちのタブも押せるように」
      → 名前チップの行を`.mlist__chip-row`でラップし、左右に矢印ボタン
      （data-chip-prev/data-chip-next）を追加。クリックで
      `.mlist__chips`を横スクロールする。またpaint()の中で現在
      アクティブなチップを`scrollIntoView()`するようにし、ホイールや
      矢印キーで進めても現在地のタブが常に見える状態を保つ。
   3. 「カルーセルの構造だけど、無限スクロールできるように始まりと
      終わりのカードが隣り合わせになるように」
      → 読む帯（`.mlist__strip`）の中身を「最後のカードの複製→本編
      N枚→最初のカードの複製」という並びで描画し（`EXT`配列、
      長さN+2）、スクロール位置を管理する変数を実データのindexである
      `idx`から、この拡張配列上の位置を表す`pos`（0〜N+1）に変更した。
      ユーザーが複製カード（pos===0またはpos===N+1）まで到達して
      スクロールが止まったら、見た目が全く同じ本編側のカード
      （pos===NまたはPOS===1）へアニメーション無しで一瞬で飛ばす
      （中身が同じ複製なので見た目には継ぎ目が分からない）。これにより
      最後のカードから右へ送ると最初のカードへ、最初のカードから左へ
      送ると最後のカードへ、途切れずにループする。
   4. 「『名前のカードをクリックすると、そのメッセージが中央に開きます。
      開いたあとはホイールや横スクロール、下の名前でも移動できます。』
      の文字は消したい」
      → message-list.html側の該当文（`.mlist__lead`）を削除済み
      （このファイルには影響なし）。
   5. 「『友人』と『家族、親族』で分けたい。カードが並んでる画面で
      区画分けしたい」
      → カード一覧の描画を、relで「友人」「家族・親族」にフィルタした
      2つのグループに分け、それぞれ見出し（`.mlist__group-title`）付きの
      セクションとして描画するように変更（`GROUPS`参照。詳細な見た目は
      assets/css/message-list.cssの.mlist__group関連ルール）。

   ▼カルーセル追加修正4件への対応
   1. 「カードのサムネイルをこの黄色の画像を使って、開いたらmp4が現状通り
      再生。という形にしたい」
      → 一覧のカードサムネイル（cardHtml）は動画そのものではなく、
      添付いただいた静止画（videoThumb: mlist-ayano-thumb.jpg）を<img>で
      表示するように変更。開いた後の読む帯（readingHtml）は従来どおり
      <video controls>でmp4を再生する（変更なし）。
   2. 「塚越 莉菜様からのメッセージが長いので縦スクロールしようとしたが、
      横スクロールが効いてしまいできなかったので中央カード上では
      縦スクロール優先にして」
      → strip側のwheelハンドラで、ホイールイベントが中央カードの本文
      （.mlist__reading-body、overflow-y:auto）上で発生していて、かつ
      その本文がまだその方向にスクロールできる余地がある場合は
      e.preventDefault()もgo()も呼ばず、ブラウザ標準の縦スクロールに
      任せるように変更。本文が上端／下端に到達したら従来どおりカルーセルの
      ページ送りに戻る。
   3. 「名前タブも上のカルーセルと一緒に動いて欲しい」
      → 従来のscrollIntoView()（落ち着いた後に非同期で追いつく動き）を
      廃止し、syncChips()を新設。読む帯のscrollLeftから実データ上の
      連続位置を求め、その比率でチップ列(chipsEl)のscrollLeftを直接
      書き換える方式に変更。strip の'scroll'イベントのたびに呼ぶことで、
      ネイティブスクロール中も含め常に読む帯とチップ列が連動して動く。
   4. 「始まりと終わりの繋ぎがうまくいってない。終わりの時に始まりの
      カード一枚だけ出てきて二枚目以降出てこない」
      → go(p, smooth)がpをEXT配列の範囲（0〜N+1）にクランプしていな
      かったため、複製カード（pos===0/N+1）から本編スロットへのテレポート
      （scheduleSettleCheckの140ms debounce）が完了する前に次のホイール
      入力（wheelLock解除520ms）が発生すると、posがEXTの範囲外（N+2等）
      になり、readings配列のどの要素とも一致しなくなってアクティブな
      カードの表示が壊れ、以後ずっと進行不能になっていた。go()自身が
      pをNぶんラップして即座に正規化するように修正し、このレース
      コンディションを解消した。

   ▼カルーセルの無限スクロール構造を3周コピー方式に再設計（本人指摘2件）
   1. 「塚越 莉菜様からの縦スクロールだけど、スクロールが端まで行ったら
      横スクロールにすぐ切り替わると見づらいので、縦スクロールがある
      場合、中央カードの上では縦スクロールしかできないという構造に
      します」
      → 前回追加した「本文の上端／下端に到達したらカルーセルのページ
      送りに戻す」フォールバックを廃止。本文がスクロール可能なカードでは
      中央カード上のホイールは常に本文の縦スクロールのみを行い、
      カルーセルのページ送りには一切切り替わらない。
   2. 「下の名前タブも上のカルーセルと同じく無限スクロールできるように
      したい。今は端まで行くとそれ以上動かない。上のカードも現状右側に
      スクロールして端まで行くと戻されるけど、ずっと右側にカードが
      出てきて右側にスクロールし続けられるようにしたい。右端だけじゃ
      なくて、最初のカードの左側にもカード作って左側にも同じく
      スクロールし続けられるようにしたい」
      → 従来のEXT方式（前後に複製カードを1枚ずつだけ足す）は、実際の
      スクロール範囲の限界（複製カードの位置）に当たってからJSが
      本編側へテレポートさせる仕組みだったため、ユーザー視点では
      「端まで行くと戻される」ように見えていた。またチップ側は元々
      N件（22件）しか無く、readings側が複製の継ぎ目を越えて動いても
      チップ側は物理的な端で止まるため、チップの無限スクロールは
      そもそも機能していなかった。
      → M配列を3回連結したFULL配列（長さ3N、[1周目, 2周目, 3周目]の
      コピー）を読む帯・名前チップの両方の描画に使うよう再設計。
      chipsもreadingsと全く同じFULL配列・同じ添字で生成するため、
      posという単一の連続位置変数だけで両方を駆動できる（realOf()での
      変換やチップ側だけのclampが不要になった）。中央（2周目、
      pos∈[N,2N-1]）を「安全地帯」とし、posが安全地帯の外に出た瞬間に
      recenterIfNeeded()がNぶんシフトして中央の等価な位置へ即座に
      （behavior:'auto'、アニメーション無しで）正規化する（3周とも中身は
      同じなので見た目には何も起きない）。これにより「複製1枚に到達→
      テレポート」ではなく「常に前後Nステップ分のカードが実際にDOM上に
      存在する」状態になり、右にも左にも途切れず新しいカードが出てくる
      ように見える。チップ列も同じ理屈でNステップ分の余裕を持って無限に
      スクロールし続けられる。
      注意：正規化は必ずアニメーション無しの瞬間移動でなければならない。
      go()の中で移動先をいきなりNぶんラップしてからその値へsmooth
      スクロールする実装を最初に試したが、それだと「1枚隣への短い移動」
      のつもりが「N枚（22枚）分先の座標へ一気にsmoothスクロール」に
      なってしまい、ブラウザの標準smoothスクロールはその距離に比例して
      長時間（数秒）かけてゆっくり通り過ぎるため、「延々とスクロールし
      続けて止まったように見える」不具合になった（実際はまだ長い
      アニメーションの途中だった）。そのためgo()自体は要求された位置への
      通常の（1枚分の短い）スクロールだけを行い、正規化は
      recenterIfNeeded()がstrip側の'scroll'イベントのたびに
      （debounceを挟まず即座に）チェックする設計にした。

   ▼2026-09 読む帯・名前タブを「transformで回り込む無限ループ」に作り直し
   （上記の3周コピー方式・recenterIfNeeded()はすべて廃止済み）
   - 本人指摘「端のカードの繋ぎだけど、まだ不自然だな。検証しながら
     参考サイト見ながら構造整えて。あとドラッグで左右に動かせるように
     もしといて」。Playwrightで1フレームずつ計測したところ、22枚目→
     1枚目へ送る時に①smoothスクロールが半分進んだ所で22枚分の瞬間移動が
     入り、残り半分が一瞬で飛ぶ、②中央のカードが別のコピーに入れ替わる
     ため不透明度0.45→1のフェードが走ってチラつく、の2点が継ぎ目でだけ
     起きていた。ネイティブスクロールで無限ループを作る限り避けられない
     ため、Embla Carousel（loop）やGSAPのhorizontalLoop()と同じ
     「各カードをtransformで並べ、画面外に出たものを1枚ずつ反対側へ
     回り込ませる」方式に変更した。詳細は下の「読む帯」セクションの
     コメント参照。
=========================================================== */
(() => {
  const INK = '#282828';
  // カード背景色：本サイトの配色（黄系グラデーション、封筒裏面の青系
  // グラデーション、バッジのピンク系）から抜いたトーン違い。
  // カタログのダミー配色そのままではなく、サイトのパレットに寄せてある。
  //
  // ▼本人指摘「カードの色がなぜか縦に分けられてるんだけど、友人と家族で
  // 二種類分けてくればいいよ」への対応
  // 従来は`PALETTE[i % PALETTE.length]`でメッセージ全体を通しの連番
  // （0〜21）から5色を単純に周期的に割り当てていた。グリッドが
  // `grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))`で
  // 画面幅によって列数が変わるため、たまたま列数がPALETTEの色数(5)の
  // 約数・倍数に近い幅では「同じ列は常に同じ色」という周期の一致が起き、
  // 本人の言う「縦に分けられてる」＝列ごとの縦縞に見えてしまっていた
  // （色そのものが意図せず列数と噛み合ってしまっただけで、意図した
  // デザインではなかった）。
  // 本人指示どおり、通し番号での周期割り当てをやめ、「友人／家族・親族」
  // の所属（`m.rel`）で2色に単純化した。列数が何列になっても、同じ
  // グループのカードは常に同じ色になるため、縦縞のような意図しない
  // パターンが出ない。
  const PALETTE_BY_REL = {
    '友人': '#FFF4C6',       // 黄系（サイトのメインカラー）
    '家族・親族': '#D6DEFE', // 青系（封筒裏面と同じトーン）
  };
  const PALETTE_FALLBACK = '#FCE3EE'; // rel未設定など想定外データ用の保険

  // ------------------------------------------------------------------
  // 本番データ（結婚祝いメッセージ一覧より）。友人12件→家族・親族10件の順。
  // ------------------------------------------------------------------
  const MESSAGES = [
    { name: '井上 優司', rel: '友人', body: `名和！みーちゃん！結婚おめでとっ〜！
2人の友人として心からお祝いするよ！
これからたくさんの壁を乗り越えないといけなかったり、辛いこともたくさんあると思う！
制限があっても2人ならきっとどんな困難も乗越えられる！
困ったことがあれば言ってな！どこでも駆けつけたるわ！
そして二人の未来が素晴らしいものでありますよう、心よりお祈り申し上げます！` },
    { name: '唐澤 慧太', rel: '友人', body: `結婚おめでとう🎊
2人仲良く末長くお幸せに` },
    { name: '西沢 駿', rel: '友人', body: '結婚おめでとう。お幸せに！' },
    { name: '宮尾 勇輝', rel: '友人', body: '結婚おめでとう！2人きりの生活にマンネリしてきたらいつでも息子役として呼んでね！ 爆速で遊びに行きます' },
    { name: '中谷 由和', rel: '友人', body: `結婚おめでとう🎉
これからいろんな大変なことがあると思うけど2人らしく笑顔の絶えない 幸せな家庭を築いて行ってな！末長くお幸せに！` },
    { name: '福田 洸希', rel: '友人', body: `ご結婚おめでとう🎉
ほんとにめでたい！
2人らしく笑顔の絶えない幸せな家庭を築いて行ってね！末長くお幸せに！` },
    { name: '小松 悠雅', rel: '友人', body: `結婚おめでとう！！
これからも笑顔と幸せが溢れる生活になりますように。
末永くお幸せに〜！` },
    { name: '宮島 汐羅', rel: '友人', body: `凌 みーちゃん 結婚おめでとう！
しっかり者の凌と少し抜けてるみーちゃんなら、最高の夫婦になれると確信しております。
どんなことがあっても互いに支えあって困難も乗り越えられるはずです！
2人の幸せを心から願っています。
もう一度言います
凌 みーちゃん 結婚おめでとう！！` },
    { name: '井上 希美', rel: '友人', body: `なわ、みーちゃん結婚おめでとう💐💍
いつも2人が笑顔でたのしそうにしてる姿を見る度に、素敵な夫婦だなって思ってます♡
これから先、楽しい事や嬉しいことが沢山あると思うし、 時には大変なこともあるかもしれないけど2人なら支え合って乗り越えられると思ってるよ😊

2人らしく、笑顔がたえない温かい家庭を築いてってね💖
改めておめでとう🎉
末永くお幸せに︎💕︎` },
    { name: '唐澤 陸斗', rel: '友人', body: `名和 みーちゃん ご結婚おめでとうございます💍🎉
これからも2人らしく幸せな家庭を築いていってね` },
    { name: '溝口 彩乃', rel: '友人', video: true, videoSrc: 'assets/video/message-list/mlist-ayano.mp4', videoPoster: 'assets/img/message-list/mlist-ayano-poster.jpg', videoThumb: 'assets/img/message-list/mlist-ayano-thumb.jpg', body: `りょうくん、みーちゃん
ご結婚おめでとうございます‼︎🕊️🍀
これからも末永く、素敵な家庭を築いていってください!🌸` },
    { name: '平石 愛星', rel: '友人', body: `なわ！みーちゃん！
ご結婚おめでとう‼︎
二人の幸せを心から願ってます。
これからも二人でおだやかなご家庭を築いていってね！
本当におめでとう✨` },
    { name: '名和 博之・こず恵', rel: '家族・親族', body: '凌・みゆちゃん ご結婚おめでとう!! これからはみゆちゃんとお互いを思いやり、明るい家庭を築いてください みゆちゃん、これからもよろしくね' },
    { name: '山﨑 優衣', rel: '家族・親族', body: 'お幸せに〜♡' },
    { name: '美結のママ', rel: '家族・親族', body: '美結、結婚おめでとう！きょうだいの中で1番大きく生まれたのに小さい頃は身体が弱くて心配の毎日でした。そんな美結も大きくなるにつれて身体も心も強くなっていろんな事に興味をもってやりたい事に挑戦する活発な子になったね。 凌君という優しくて理解あるパートナーに出会い、また素敵なお友達に囲まれて今日という日が迎えられたこと親として何よりも嬉しいよ 感謝の気持を忘れずに、２人仲良く手を取り合って穏やかで幸せな家庭を作ってね。 ママに会いたくなったらいつでもきていぃよー' },
    { name: '塚越父', rel: '家族・親族', body: `美結へ 3人兄弟はどうだった？(笑) 親はとっても楽しかったよ！ 良く寝て気が強くてちょい抜けてるけど頑張り屋で思いやりのある子。 美結が長女で良かった。 周りの人達に感謝だな！ これからは凌君と力を合わせて、自分達らしい良い家庭を築きな。 末永く幸せに！ 結婚おめでとう!!` },
    { name: '山﨑 晋一・奈津恵（おじ、おば）', rel: '家族・親族', body: '凌、美結さん　ご結婚おめでとうございます 天国のじいちゃん、ばあちゃんとっても喜んでいるでしょうね これからはお互いが思いやりを持ち、仲良く過ごしてくださいね 二人の新居完成楽しみにしています🎵' },
    { name: '塚越 唯人', rel: '家族・親族', body: `ご結婚おめでとうございます🙇‍♀️ 今後2人がずっと幸せであれることを祈っています。がんばってね！ ほんとにおめでとう🎉` },
    { name: '叔母 美由紀', rel: '家族・親族', body: `凌君、美結さん ご結婚おめでとうございます。
小さい頃から見てきた凌君が、今日こうして素敵な家庭を築く日を迎えたことをとてもうれしく思います。
お二人で力を合わせて、あたたかく幸せな家庭を築いていって下さい。
これからもずっと応援しています。` },
    { name: '小林 峰雄', rel: '家族・親族', body: `凌君　美結さん
ご結婚おめでとうございます
あなた方ふたりに
幸多からんことを叔父さんは真に願います` },
    { name: '塚越 莉菜', rel: '家族・親族', body: `みちゃん＆りょくん
結婚おめでとう💍💖
ずっと一緒に遊んでくれてた2人がついに結婚と聞いて自分のことのよーに嬉しかった^_^
2人の結婚報告を一番最初に受けれたこともすごい嬉しかったんだよ〜！本当にありがとう。
それぞれに一言ずつ伝えます❁⃘*.ﾟ
まずはりょくん！普段からほんとの妹みたいに接してくれて遊んでくれて、困った時はすぐ助けてくれるし本当に感謝しかないよ。いつもありがとう！！！りょくんといる時のみーは凄い楽しそうで幸せそうでそれを見るのが妹として嬉しかったです。りょくんがみーの旦那さんになるのはすごく安心だし嬉しいし、本当に良かったって家族みんな思ってます😊だからこれからも、ずーっとみーのことをよろしくお願いします💟
次、みちゃん！ついにみーが結婚するのかあ、って感じです。笑
みーは兄弟の中で1番苦労をしてきたとうちは思ってるからこそ結婚と聞いてきっとママパパに負けないくらい喜んでます笑笑ほんとーに結婚おめでとう︎💕︎これから先嬉しいこと幸せな事がある分、きっと辛いことも悲しいこともあると思うけど、1人じゃないでね。隣にはりょくんがいて周りには家族がいて友達、色々な人達がみーを助けてくれるから大丈夫だでね^_^もちろんうちは何があってもみーの味方なのでなんでも頼ってきてください。
りょくに幸せにしてもらうんだよ💞
最後に、結婚本当におめでとう‼️
これからもふたりで仲良く末永く幸せになってください🫶
あたたかく見守らせていただきます。
いっぱい遊んでね🎶遊び連れてってね🎶
これからもよろしくね✩.*˚` },
    { name: '名和 正幸／千春／あかり／翼', rel: '家族・親族', body: `凌くん、美結さんへ。
ご結婚おめでとうございます。

これからのおふたりの毎日が、穏やかであたたかな気持ちに包まれる、心地よい時間となりますように。
嬉しい日も、少し立ち止まりたい日も、ふたりで重ねていくことで、そっと心に残るやさしい思い出が積み重なっていきますよう願っています。

心から祝福しています。` },
  ];

  const M = MESSAGES.map((m, i) => ({
    ...m,
    i,
    num: String(i + 1).padStart(2, '0'),
    color: PALETTE_BY_REL[m.rel] || PALETTE_FALLBACK,
  }));
  const N = M.length;
  const pad2 = (n) => String(n).padStart(2, '0');

  const grid = document.getElementById('mlistGrid');
  const overlay = document.getElementById('mlistOverlay');
  if (!grid || !overlay) return;

  // ---------------- カード一覧（友人／家族・親族で区画分け） ----------------
  function cardHtml(m) {
    let mediaHtml;
    if (m.video) {
      // 本人指示「カードのサムネイルをこの黄色の画像を使って、開いたら
      // mp4が現状通り再生。という形にしたい」への対応：一覧のカード
      // サムネイルは動画そのもの（自動再生）ではなく、添付いただいた
      // 静止画（videoThumb、本人からの黄色い「Happy Wedding RYO/MIYU」
      // イラスト）を<img>で表示するように変更した。動画（<video>、
      // controls付き）を再生するのは開いた後の読む帯側（readingHtml）
      // のみとし、これまで通りの挙動を維持している。
      mediaHtml = `<img class="mlist__photo" src="${m.videoThumb}" alt="${m.name}様からのメッセージカード" data-photo-img>
           <span class="mlist__card-photo-tag">${m.name}様から</span>`;
    } else if (m.photo) {
      mediaHtml = `<img class="mlist__photo" src="${m.photoSrc}" alt="${m.name}様からの写真" data-photo-img>
           <span class="mlist__photo-fallback" data-photo-fallback hidden>写真を<br>ここに配置</span>
           <span class="mlist__card-photo-tag">${m.name}様から</span>`;
    } else {
      mediaHtml = `<span class="mlist__card-num mlist-dela">${m.num}</span>
           <span class="mlist__card-name">${m.name}様から</span>
           <span class="mlist__card-rel">${m.rel}</span>`;
    }
    return `
    <button type="button" class="mlist__card" data-i="${m.i}" style="--card-bg:${m.color}" aria-label="${m.name}様からのメッセージを読む">
      ${mediaHtml}
    </button>`;
  }

  const GROUPS = [
    { key: 'friend', label: '友人', items: M.filter((m) => m.rel === '友人') },
    { key: 'family', label: '家族・親族', items: M.filter((m) => m.rel === '家族・親族') },
  ].filter((g) => g.items.length > 0);

  grid.innerHTML = GROUPS.map((g) => `
    <section class="mlist__group" data-group="${g.key}">
      <h2 class="mlist__group-title"><span>${g.label}</span></h2>
      <div class="mlist__group-grid">
        ${g.items.map(cardHtml).join('')}
      </div>
    </section>
  `).join('');

  // 写真読み込み失敗時はダミー画像を隠してプレースホルダーを出す
  grid.querySelectorAll('[data-photo-img]').forEach((img) => {
    img.addEventListener('error', () => {
      img.dataset.broken = 'true';
      const fallback = img.parentElement.querySelector('[data-photo-fallback]');
      if (fallback) fallback.hidden = false;
    });
  });
  // 動画読み込み失敗時は要素ごと隠す（写真と違い代替テキストは出さない。
  // このカードは元々videoSrcが確実に存在する前提のため、フォールバック
  // UIまでは用意していない）。
  grid.querySelectorAll('[data-video]').forEach((v) => {
    v.addEventListener('error', () => { v.dataset.broken = 'true'; });
  });

  // ---------------- 読む帯（オーバーレイ） ----------------
  // ▼2026-09 作り直し：ブラウザ標準の横スクロール → transformで回り込む無限ループ
  // 本人指摘「メッセージの下層ページの端のカードの繋ぎだけど、まだ不自然だな。
  // 検証しながら参考サイト見ながら構造整えて。あとドラッグで左右に動かせる
  // ようにもしといて」への対応。
  //
  // 【旧方式の問題（Playwrightで1フレームずつ計測して確認）】
  // 旧方式は「22件を3周分（66枚）並べた横スクロール＋scroll-snap」で、中央の
  // 1周から外へ出た瞬間にscrollLeftを22枚分瞬間移動させていた。22枚目→1枚目へ
  // 送ると、smoothスクロールがちょうど半分（約0.25秒、21.49枚目の位置）まで
  // 進んだところで瞬間移動が入ってアニメーションが打ち切られ、残り半分が
  // 一瞬で飛んでいた。さらに中央に来るカードが「別のコピーのDOM要素」に
  // 入れ替わるため、不透明度0.45→1のCSS transition（0.3秒）が走って
  // 「薄いカードがふわっと濃くなる」チラつきも出ていた。どちらも継ぎ目
  // でだけ起きるため「端の繋ぎが不自然」に見えていた。ネイティブスクロールで
  // 無限ループを作る限り、この瞬間移動（とそれによるアニメーションの中断）は
  // 原理的に避けられない。
  //
  // 【新方式】Embla Carousel（loopオプション）やGSAPのhorizontalLoop()
  // ヘルパーと同じ考え方：ネイティブスクロールは使わず、各カードを
  // transform: translate3d()で並べ、画面外に出たカードを1枚ずつ反対側へ
  // 回り込ませる（22件の輪をぐるぐる回すイメージ）。
  //   - 現在地は連続値 p（カード何枚分か。整数＝そのカードが中央、上下限なし）。
  //   - 各カードの表示位置は「iとpの差」を -N/2〜N/2 の範囲に折り返した値
  //     （wrapDelta）× 1枚分の幅。pがどれだけ増えても減っても、カードは
  //     常に中央付近に22枚分の輪として並ぶため、継ぎ目という概念自体が無い。
  //   - DOMは22枚だけ（3周コピーは廃止）。中央のカードが別要素に入れ替わる
  //     ことも無いので、不透明度・拡大率は位置から毎フレーム連続的に計算
  //     する（CSS transitionは使わない）。
  //   - 名前タブも同じpで駆動し、同じ「回り込み」で並べる（幅がバラバラなので
  //     カード枚数ではなく実測の累積幅で折り返す＝layoutChips()/renderChips()）。
  //   - 操作：縦ホイール（1枚ずつ）／横ホイール・トラックパッド（連続）／
  //     ドラッグ（マウス・タッチ、離した時の勢いで最寄りのカードへ吸着）／
  //     ←→キー／名前タブ／脇に見えているカードをクリック。
  function readingHtml(m) {
    let mediaHtml;
    if (m.video) {
      // 本人指示「溝口彩乃様からのmp4だけど再生バーとか最大化とかいらないから
      // 再生停止だけできればいいよ」を受けて、ブラウザ標準のcontrols
      // （シークバー・音量・全画面など）を外し、トップページのMEMORYの動画
      // カードと同じ「動画全体が押せる再生/停止ボタン」だけにした。
      // 自動再生（muted loop）で始まり、押すたびに停止⇄再生を切り替える。
      mediaHtml = `<div class="mlist__reading-photo mlist__video-card is-playing" data-video-card>
                <video class="mlist__video" src="${m.videoSrc}" poster="${m.videoPoster || ''}" data-video muted loop playsinline autoplay preload="metadata"></video>
                <button type="button" class="mlist__video-toggle" data-video-toggle aria-label="動画を停止">
                  <svg class="mlist__video-icon mlist__video-icon--play" viewBox="0 0 36 36" aria-hidden="true"><path d="M12 9 L26 18 L12 27 Z" /></svg>
                  <svg class="mlist__video-icon mlist__video-icon--pause" viewBox="0 0 36 36" aria-hidden="true"><rect x="10" y="8" width="6" height="20" rx="3" /><rect x="20" y="8" width="6" height="20" rx="3" /></svg>
                </button>
              </div>`;
    } else if (m.photo) {
      mediaHtml = `<div class="mlist__reading-photo"><img class="mlist__photo" src="${m.photoSrc}" alt="${m.name}様からの写真" data-photo-img draggable="false">
                <span class="mlist__photo-fallback" data-photo-fallback hidden>写真を<br>ここに配置</span></div>`;
    } else {
      mediaHtml = `<div class="mlist__reading-strip-color" style="--card-bg:${m.color}"></div>`;
    }
    return `
        <article class="mlist__reading" data-reading data-real="${m.i}">
          ${mediaHtml}
          <!-- 本人指摘「最初の漢字一文字を使ってアイコンみたいなの作って
               くれたけど、いらないかな」への対応：名前の頭文字だけを
               取り出した丸いアバターアイコン（旧.mlist__reading-avatar）
               を削除。名前・続柄・番号だけのシンプルな見出しに戻した。 -->
          <div class="mlist__reading-head">
            <span>
              <span class="mlist__reading-name" style="display:block">${m.name}様から</span>
              <span class="mlist__reading-rel">${m.rel}</span>
            </span>
            <span class="mlist__reading-num mlist-dela">${m.num}</span>
          </div>
          <p class="mlist__reading-body">${m.body}</p>
        </article>`;
  }

  function chipHtml(m) {
    return `
          <button type="button" class="mlist__chip" data-i="${m.i}">
            <span class="mlist__chip-dot" style="--card-bg:${m.color}"></span>${m.name}様
          </button>`;
  }

  overlay.innerHTML = `
    <button type="button" class="mlist__backdrop" aria-label="一覧に戻る"></button>
    <div class="mlist__counter mlist-dela" data-counter></div>
    <button type="button" class="mlist__close">
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2 L12 12 M12 2 L2 12" stroke="${INK}" stroke-width="2" stroke-linecap="round"/></svg>
      閉じる
    </button>
    <div class="mlist__strip" data-strip>
      ${M.map(readingHtml).join('')}
    </div>
    <div class="mlist__chip-row">
      <button type="button" class="mlist__chip-nav" data-chip-prev aria-label="前のメッセージへ">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M9 2 L3 7 L9 12" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="mlist__chips" data-chips>
        ${M.map(chipHtml).join('')}
      </div>
      <button type="button" class="mlist__chip-nav" data-chip-next aria-label="次のメッセージへ">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M5 2 L11 7 L5 12" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>
  `;

  overlay.querySelectorAll('[data-photo-img]').forEach((img) => {
    img.addEventListener('error', () => {
      img.dataset.broken = 'true';
      const fallback = img.parentElement.querySelector('[data-photo-fallback]');
      if (fallback) fallback.hidden = false;
    });
  });

  // 動画の再生／停止（本人指示「再生停止だけできればいいよ」）。
  // MEMORY（トップページ）の動画カードと同じく、再生中は.is-playingを付けて
  // アイコンを縦棒2本⇄三角で切り替える（表示・非表示はCSS側）。
  overlay.querySelectorAll('[data-video-card]').forEach((card) => {
    const v = card.querySelector('[data-video]');
    const btn = card.querySelector('[data-video-toggle]');
    const sync = () => {
      const playing = !v.paused;
      card.classList.toggle('is-playing', playing);
      btn.setAttribute('aria-label', playing ? '動画を停止' : '動画を再生');
    };
    v.addEventListener('error', () => { v.dataset.broken = 'true'; });
    v.addEventListener('play', sync);
    v.addEventListener('pause', sync);
    btn.addEventListener('click', () => {
      if (v.paused) { const pr = v.play(); if (pr && pr.catch) pr.catch(() => {}); }
      else v.pause();
    });
    sync();
  });

  const strip = overlay.querySelector('[data-strip]');
  const counter = overlay.querySelector('[data-counter]');
  const readings = [...overlay.querySelectorAll('[data-reading]')]; // 長さN（実データと1対1）
  const chips = [...overlay.querySelectorAll('.mlist__chip')];      // 長さN（実データと1対1）
  const chipsEl = overlay.querySelector('[data-chips]');
  const chipPrev = overlay.querySelector('[data-chip-prev]');
  const chipNext = overlay.querySelector('[data-chip-next]');
  const cards = [...grid.querySelectorAll('.mlist__card')];

  const backLink = document.querySelector('.mlist__back');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let p = 0;            // 現在地（カード何枚分か、連続値・上下限なし）
  let open = false;
  let wheelLock = false;
  let anim = null;      // 進行中の吸着アニメーション { from, to, t0, dur }
  let rafId = 0;

  // 整数・小数どちらでも、実データ上のindex（0〜N-1）へ
  const mod = (a, n) => ((a % n) + n) % n;
  // i番目の項目と現在地pの差を「-n/2〜n/2」の範囲へ折り返す（＝輪の上で一番近い向きの距離）
  const wrapDelta = (d, n) => mod(d + n / 2, n) - n / 2;
  const activeIndex = () => mod(Math.round(p), N);

  // 1枚分の送り幅（カード幅＋カード間の余白）。余白はCSS変数--mlist-gapで持つ
  // （PC 28px／SP 16px。旧方式ではflexのgapだったもの）。
  function cardStep() {
    if (!readings[0]) return 0;
    const gap = parseFloat(getComputedStyle(strip).getPropertyValue('--mlist-gap')) || 0;
    return readings[0].offsetWidth + gap;
  }

  // ---- 名前タブの回り込み配置 ----
  // タブは文字数で幅が違うため、実測幅の累積で「輪」を作る。
  // chipCenters[i]＝輪の先頭から見たi番目のタブの中心、ring＝輪1周の長さ。
  const CHIP_GAP = 8;
  let chipWidths = [];
  let chipCenters = [];
  let ring = 0;
  function layoutChips() {
    chipWidths = chips.map((c) => c.offsetWidth);
    chipCenters = [];
    let x = 0;
    chipWidths.forEach((w) => { chipCenters.push(x + w / 2); x += w + CHIP_GAP; });
    ring = x;
  }
  function renderChips() {
    if (!chipsEl || !ring) return;
    const i0 = Math.floor(p);
    const frac = p - i0;
    const a = mod(i0, N);
    const b = mod(i0 + 1, N);
    // aの次がbとは限らず、a=N-1→b=0の時は輪を1周またぐので+ring
    const cb = chipCenters[b] + (b < a ? ring : 0);
    const focus = chipCenters[a] + (cb - chipCenters[a]) * frac; // 今、中央に来るべき位置
    const half = chipsEl.clientWidth / 2;
    const active = activeIndex();
    chips.forEach((c, i) => {
      const dx = wrapDelta(chipCenters[i] - focus, ring);
      c.style.transform = `translate3d(${(half + dx - chipWidths[i] / 2).toFixed(2)}px,0,0)`;
      c.classList.toggle('is-active', i === active);
    });
  }

  // ---- 読む帯の描画（毎フレーム） ----
  function render() {
    const step = cardStep();
    const active = activeIndex();
    counter.textContent = pad2(active + 1) + ' / ' + pad2(N);
    // 画面の左右に見えている範囲＋1枚だけ描けば十分（それ以外は非表示にして描画負荷を下げる）
    const reach = step ? strip.clientWidth / 2 / step + 1.5 : N;
    readings.forEach((r, i) => {
      const d = wrapDelta(i - p, N);
      const ad = Math.min(Math.abs(d), 1);
      r.style.transform = `translate3d(${(d * step).toFixed(2)}px,0,0) scale(${(1 - 0.06 * ad).toFixed(4)})`;
      r.style.opacity = (1 - 0.55 * ad).toFixed(3);
      r.style.visibility = Math.abs(d) > reach ? 'hidden' : '';
      r.classList.toggle('is-active', i === active);
      r.setAttribute('aria-hidden', i === active ? 'false' : 'true');
    });
    renderChips();
  }

  // ---- 吸着アニメーション（requestAnimationFrame） ----
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  function tick(now) {
    rafId = 0;
    if (!anim) return;
    const t = Math.min(1, (now - anim.t0) / anim.dur);
    p = anim.from + (anim.to - anim.from) * easeOut(t);
    render();
    if (t < 1) rafId = requestAnimationFrame(tick);
    else { p = anim.to; anim = null; normalize(); render(); }
  }
  // pは上下限なしの連続値だが、数値が際限なく大きくならないよう、
  // 止まっている時だけ見た目の変わらない範囲（0〜N）へ戻しておく
  // （wrapDeltaで位置を計算しているので、Nの倍数ずらしても表示は完全に同じ）。
  function normalize() { p = mod(p, N); }

  function animateTo(target, dur) {
    if (reduceMotion.matches) { anim = null; p = target; normalize(); render(); return; }
    anim = { from: p, to: target, t0: performance.now(), dur: dur || 460 };
    if (!rafId) rafId = requestAnimationFrame(tick);
  }
  function stopAnim() { anim = null; if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } }

  // 相対的に±n枚送る。アニメーション中に続けて押された場合は「今向かっている
  // カード」を起点に足すので、素早い連打でも取りこぼさず1枚ずつ進む。
  function step(n) {
    const base = anim ? anim.to : Math.round(p);
    animateTo(base + n);
  }
  // 実データindexのカードへ、輪の上で近い方の向きから移動する
  function goToIndex(i) {
    const base = anim ? anim.to : Math.round(p);
    animateTo(base + wrapDelta(i - mod(base, N), N));
  }

  function openAt(i) {
    stopAnim();
    p = i;
    open = true;
    overlay.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
    // 読む帯が開いている間は左上の「TOPへ戻る」と件数表示（00 / 00）が
    // 同じ位置で重なるため、戻るリンクは一時的に隠す。
    if (backLink) backLink.style.visibility = 'hidden';
    // 開くたびに入場アニメーション（mlist-rise）を最初から再生する。
    // （旧方式ではクラスごと付け外しするとscroll-snapの再評価で位置が
    // ずれる問題があったためinline styleで再起動していた。新方式は
    // スクロールを使わないので問題は起きないが、同じやり方を踏襲。）
    strip.style.animation = 'none';
    void strip.offsetWidth;
    strip.style.animation = '';
    layoutChips(); // hidden解除後でないとタブの実測幅が0になるため、開くたびに測る
    render();
    const v = readings[i] && readings[i].querySelector('[data-video]');
    if (v && v.paused) { const pr = v.play(); if (pr && pr.catch) pr.catch(() => {}); }
  }

  function close() {
    stopAnim();
    open = false;
    overlay.setAttribute('hidden', '');
    document.body.style.overflow = '';
    if (backLink) backLink.style.visibility = '';
    overlay.querySelectorAll('[data-video]').forEach((v) => v.pause());
  }

  cards.forEach((c) => c.addEventListener('click', () => openAt(+c.dataset.i)));
  overlay.querySelector('.mlist__backdrop').addEventListener('click', close);
  overlay.querySelector('.mlist__close').addEventListener('click', close);
  chips.forEach((c) => c.addEventListener('click', () => goToIndex(+c.dataset.i)));
  // 名前タブ両脇の矢印：タブ列が読む帯と完全に連動するようになったので、
  // 「タブ列だけを横にずらす」のではなく前後のメッセージへ1件送る動きにした。
  if (chipPrev) chipPrev.addEventListener('click', () => step(-1));
  if (chipNext) chipNext.addEventListener('click', () => step(1));

  // ---- ドラッグ（マウス・タッチ共通、Pointer Events） ----
  // 横方向に一定以上動いた時だけドラッグとみなす（縦の動きが勝った場合は
  // 何もしない＝長文の本文の縦スクロールをそのまま通す。CSS側で
  // touch-action: pan-y を指定しているので、タッチの縦スクロールは
  // ブラウザが処理し、横方向の動きだけがここに来る）。
  //
  // 動画カードの再生／停止ボタンは写真枠いっぱいの大きさがあるので、
  // その上から始めたドラッグも普通にドラッグとして扱う（ボタンとしての
  // 押下は、ドラッグにならなかった場合＝その場で離した場合だけ効く）。
  // ※当初はボタン上ではドラッグを始めない実装にしていたが、検証で
  // 「ボタン上で押して横に動かし、帯の余白で離す」とブラウザがclickを
  // 押した要素と離した要素の共通の親（帯そのもの）に発火させるため、
  // 「余白クリック＝閉じる」扱いになって読む帯が閉じてしまう不具合が
  // 見つかった。ドラッグ扱いにした上で、閉じる判定も「押し始めた場所も
  // 余白だった時だけ」に限定している（下のclickハンドラ参照）。
  const DRAG_START = 6;
  let drag = null;       // { id, x0, y0, p0, active, samples }
  let suppressClick = false;
  let downOnGap = false; // 押し始めた場所が帯の余白（カードの外）だったか
  strip.addEventListener('pointerdown', (e) => {
    downOnGap = e.target === strip;
    if (!open || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, p0: p, active: false, samples: [] };
  });
  // ドラッグ中はブラウザの文字選択を始めさせない（本文の上から横に
  // ドラッグした時、選択範囲が残ってしまうのを防ぐ）
  strip.addEventListener('selectstart', (e) => { if (drag && drag.active) e.preventDefault(); });
  strip.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0;
    const dy = e.clientY - drag.y0;
    if (!drag.active) {
      if (Math.abs(dy) > DRAG_START && Math.abs(dy) > Math.abs(dx)) { drag = null; return; } // 縦の操作だった
      if (Math.abs(dx) < DRAG_START) return;
      drag.active = true;
      drag.x0 = e.clientX; // ここを起点にすると、判定のための遊び(6px)ぶん跳ねない
      stopAnim();
      drag.p0 = p;
      strip.setPointerCapture(e.pointerId);
      strip.classList.add('is-dragging');
    }
    const sel = window.getSelection && window.getSelection();
    if (sel && sel.rangeCount && sel.removeAllRanges) sel.removeAllRanges();
    const stepW = cardStep() || 1;
    p = drag.p0 - (e.clientX - drag.x0) / stepW;
    const now = performance.now();
    drag.samples.push({ t: now, p });
    while (drag.samples.length > 2 && now - drag.samples[0].t > 100) drag.samples.shift();
    render();
  });
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.active) return;
    strip.classList.remove('is-dragging');
    suppressClick = true; // ドラッグ直後のclick（カードや背景のクリック扱い）を無視する
    setTimeout(() => { suppressClick = false; }, 0);
    // 離す直前100msの速度から「勢い」を出し、最大±3枚ぶん先の最寄りカードへ吸着
    let v = 0; // カード枚数/ms
    if (d.samples.length >= 2) {
      const a = d.samples[0];
      const b = d.samples[d.samples.length - 1];
      if (b.t > a.t) v = (b.p - a.p) / (b.t - a.t);
    }
    const throwCards = Math.max(-3, Math.min(3, v * 220));
    let target = Math.round(p + throwCards);
    // ほんの少し動かして離した時も、動かした向きに1枚は進むようにする
    if (target === Math.round(d.p0) && Math.abs(p - d.p0) > 0.12) target = Math.round(d.p0) + Math.sign(p - d.p0);
    animateTo(target, 420 + Math.min(260, Math.abs(target - p) * 90));
  }
  strip.addEventListener('pointerup', endDrag);
  strip.addEventListener('pointercancel', endDrag);
  strip.addEventListener('dragstart', (e) => e.preventDefault()); // 画像のブラウザ標準ドラッグを無効化

  // クリック：脇に見えているカードを押したらそのカードへ、カードの外
  // （帯の余白部分）を押したら一覧へ戻る（旧方式と同じ）。
  strip.addEventListener('click', (e) => {
    if (suppressClick) { e.preventDefault(); e.stopPropagation(); return; }
    const r = e.target.closest && e.target.closest('[data-reading]');
    if (!r) { if (downOnGap) close(); return; }
    const i = readings.indexOf(r);
    if (i !== activeIndex()) { e.preventDefault(); goToIndex(i); }
  }, true);

  // ---- ホイール ----
  let wheelSnapTimer = 0;
  strip.addEventListener('wheel', (e) => {
    if (!open) return;
    // 横方向（トラックパッドの横スワイプ・Shift+ホイール）：指の動きに
    // そのまま追従させ、止まったら最寄りのカードへ吸着する。
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      e.preventDefault();
      stopAnim();
      p += e.deltaX / (cardStep() || 1);
      render();
      clearTimeout(wheelSnapTimer);
      wheelSnapTimer = setTimeout(() => animateTo(Math.round(p), 360), 140);
      return;
    }
    // 縦方向：本人指摘「縦スクロールがある場合、中央カードの上では縦スクロール
    // しかできないという構造にします」（2-3aq）の仕様を維持。本文がスクロール
    // できる中央カードの上では常にブラウザ標準の縦スクロールに任せる。
    const activeReading = readings[activeIndex()];
    const body = e.target.closest && e.target.closest('.mlist__reading-body');
    if (activeReading && body && activeReading.contains(body) && body.scrollHeight > body.clientHeight) {
      return;
    }
    e.preventDefault();
    if (Math.abs(e.deltaY) < 12 || wheelLock) return;
    wheelLock = true;
    setTimeout(() => { wheelLock = false; }, 420);
    step(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });

  document.addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft') step(-1);
  });

  window.addEventListener('resize', () => { if (open) { layoutChips(); render(); } });
  // Webフォント読込完了でタブの幅が変わるので測り直す
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { if (open) { layoutChips(); render(); } });
  }

  // ---------------- ページ遷移（サークルマスク） ----------------
  // 「MESSAGEに戻る」：アニメーションはせず、「戻ってきた」印だけ残して
  // 即座にindex.htmlへ遷移する（見た目の動きはindex.html側の
  // shrinkOverlayAwayが担当。画面中央を中心に、覆っていたオーバーレイが
  // 閉じながら消えることで「戻る」動きになる）。
  if (backLink && window.wlpPageTransition) {
    backLink.addEventListener('click', (e) => {
      e.preventDefault();
      const href = backLink.getAttribute('href') || 'index.html';
      window.wlpPageTransition.markReturn();
      window.location.href = href;
    });
  }

  // このページ自身の入場演出：#mlistReveal（戻るリンク＋メイン全体）を
  // 画面中央から円0%→150%へ広げる。index.htmlのMESSAGEカードからでも
  // ブラウザの直接アクセスでも、常にこの「広がって現れる」動きを見せる
  // （行き先の遷移方法によらず、このページ自身の入場アニメーションとして
  // 常に実行する。本人指示：「広がって下層ページが表示されるように」）。
  const revealEl = document.getElementById('mlistReveal');
  if (revealEl && window.wlpPageTransition) {
    requestAnimationFrame(() => {
      window.wlpPageTransition.growReveal(revealEl);
    });
  }
})();

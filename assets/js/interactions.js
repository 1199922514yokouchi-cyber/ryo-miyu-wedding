/* ==========================================================
   TY-15 読み進め強調（スクロール量と文字色を連動・1文字ずつ／1行ずつ）

   「本当に読んでいる感覚」にするため、行をまたいだ同時進行は
   させない：1行目の1文字目→1行目の最後の文字→2行目の1文字目→…
   という順番だけが進む。仕組み：

   - 読み位置ライン（既定：画面中央、lineY）を基準に、各行ごとの
     "担当レンジ"を決める。担当レンジの境界は「隣の行との中間点」
     （＝lineY ± 隣接行との間隔の半分）で、隣り合う行同士がぴったり
     継ぎ目なく接するようにしている。これは行間が一定である限り
     スクロール量に対して固定なので、初期化時ではなく素直に毎フレーム
     行の現在位置から算出しても同じ値になる（実測なのでレイアウト変更
     ・リサイズにも自動で追従する）。
   - ある行の担当レンジの中では、その行の実際の現在位置(centerY)が
     レンジのどこにあるかで0〜1の連続値(lineT)を出し、文字は左から
     順番にlineTがそのindexぶんのしきい値を超えた時点でアクティブに
     切り替わる。
   - 色は2値のみ：アクティブ=#FFFFFF、非アクティブ=#B2B2B2
     （グラデーションではなくliteralに2色を切り替える）。切り替え自体は
     ここでinline styleに都度セットしているだけだが、瞬時の切り替えだと
     カクついて見えるため、CSS側(.char)に`transition: color 0.2s`を
     指定して自然なフェードにしている（本人指示）。
   - しきい値越えの一度きりのトリガーではなく、毎フレーム位置から
     再計算する連続関数なので、スクロールを戻すと同じ道を逆再生
     するように自然に非アクティブへ戻っていく（行き/帰り対称）。

   「サークルが広がっている間は本文が見えない方がいい」という
   こだわりを踏襲し、見出しの登場演出(about-arc.js)と同じ
   'about:enter'（サークルが完全に開いた瞬間）まで本文全体を
   非表示にしておく。スクロールが実際に進んでから初めて見え始める。

   呼び出し元：pager.js が本文のscrollTopを確定させた直後に、毎フレーム
   window.aboutReading.update() を呼ぶ（慣性スクロールでスムージング
   済みの位置に完全同期する。参照：pager.jsのupdateReadingColors()）。
=========================================================== */
(() => {
  const textInner = document.querySelector('[data-readline-group]');
  const lines = document.querySelectorAll('[data-readline]');
  if (!lines.length) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const ACTIVE_COLOR = '#FFFFFF';
  const INACTIVE_COLOR = '#B2B2B2';

  // 読み位置ライン：既定は画面中央(50%)。見出しとの距離感を調整したい
  // ときは、ここに画面高さに対する割合でオフセットを足す
  // （例：-5 で中央よりやや上、+5 でやや下にラインを動かす）。
  const READ_LINE_OFFSET_PERCENT = 0;

  // 隣接行の情報が取れない場合（行が1つしかない等）のフォールバック幅(px)
  const FALLBACK_GAP_PX = 60;

  /* ---- 各行を「読み上げ用テキスト」＋「1文字ずつのspan」に分割 ---- */
  const lineGroups = [];

  lines.forEach((el) => {
    const text = el.textContent;
    el.textContent = '';

    const srSpan = document.createElement('span');
    srSpan.className = 'sr-only';
    srSpan.textContent = text;
    el.appendChild(srSpan);

    const visualWrap = document.createElement('span');
    visualWrap.setAttribute('aria-hidden', 'true');

    const chars = [];
    Array.from(text).forEach((ch) => {
      const charSpan = document.createElement('span');
      charSpan.className = 'char';
      charSpan.textContent = ch === ' ' ? ' ' : ch;
      charSpan.style.color = INACTIVE_COLOR;
      visualWrap.appendChild(charSpan);
      chars.push(charSpan);
    });

    el.appendChild(visualWrap);
    lineGroups.push({ el, chars });
  });

  if (reduceMotion) {
    // reduced-motionでは動きを付けず、最初から全部アクティブ色で固定表示
    lineGroups.forEach(({ chars }) => {
      chars.forEach((c) => { c.style.color = ACTIVE_COLOR; });
    });
    if (textInner) textInner.classList.add('is-visible');
    window.aboutReading = { update() {} };
    return;
  }

  function clamp01(v) {
    return Math.min(1, Math.max(0, v));
  }

  function update() {
    const lineY = window.innerHeight * (0.5 + READ_LINE_OFFSET_PERCENT / 100);

    // 各行の「現在の」中心Y。行間はスクロールしても変わらない
    // （本文全体が一体で動くだけなので）、毎フレーム測っても
    // 隣接行との間隔は常に同じ値になる＝担当レンジは実質固定。
    const centers = lineGroups.map(({ el }) => {
      const rect = el.getBoundingClientRect();
      return rect.top + rect.height / 2;
    });

    const n = centers.length;

    lineGroups.forEach(({ el, chars }, i) => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return; // 非表示中は計算しない

      const gapPrev = i > 0 ? centers[i] - centers[i - 1] : null;
      const gapNext = i < n - 1 ? centers[i + 1] - centers[i] : null;
      const halfBefore = (gapPrev ?? gapNext ?? FALLBACK_GAP_PX) / 2;
      const halfAfter = (gapNext ?? gapPrev ?? FALLBACK_GAP_PX) / 2;

      // この行の担当レンジ：上下とも「隣の行との中間点」が境界になる
      // ので、行同士のレンジは継ぎ目なく（重複も隙間もなく）並ぶ
      // （開始側は前の行との間隔、終了側は次の行との間隔を使う）。
      const isLast = i === n - 1;
      const bandStartY = lineY + halfBefore; // ここより下＝この行はまだ未着手(lineT=0)
      // 最後の行は「画面中央に来た瞬間」が本文スクロールの物理的な限界
      // （padding-bottomの設計上、それ以上スクロールできない）と一致する。
      // 他の行と同じ幅でレンジを取ると理論上の終端に物理的に到達できず、
      // 最後の数文字（句読点など）が永遠に非アクティブのまま残ってしまう
      // ため、最後の行だけは「中央に到達した時点で読了」とみなす。
      const bandEndY = isLast ? lineY : lineY - halfAfter; // ここより上＝この行は読了(lineT=1)

      const lineT = clamp01((bandStartY - centers[i]) / (bandStartY - bandEndY));
      const total = chars.length;

      chars.forEach((charEl, ci) => {
        const threshold = (ci + 1) / total; // その文字が"アクティブになるべき"lineTのしきい値
        charEl.style.color = lineT >= threshold ? ACTIVE_COLOR : INACTIVE_COLOR;
      });
    });
  }

  // 初期状態（ページ読込み直後）にも一度反映しておく
  update();

  window.aboutReading = { update };

  // サークルが完全に開いた瞬間（見出しのバウンス登場と同じタイミング）
  // まで本文全体を非表示にしておく。
  window.addEventListener(
    'about:enter',
    () => {
      if (textInner) textInner.classList.add('is-visible');
    },
    { once: true }
  );
})();

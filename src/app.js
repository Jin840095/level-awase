/* レベル合わせるぞい: 画面
   画面は4つ: 授業(home) / おすすめ(recommend) / 本棚(shelf) / 本の詳細(book-○)。
   URLの # で切り替えるので、ブラウザの戻る・進むがそのまま使える。 */
(function () {
  'use strict';
  var D = JSON.parse(document.getElementById('lv-data').textContent);
  var L = LV.build(D);
  var app = document.getElementById('app');
  var KEY = 'lvl-awase-v3';
  var LEVELS = ['入門', '基礎', '応用', '発展'];
  var LEVEL_NOTE = [
    '前提になる知識がなくても読めます',
    '前提になる知識が1〜3個',
    '前提になる知識が4〜7個',
    '前提になる知識が8個以上、または別の本の続き'
  ];
  var STAGES = [
    { label: 'これから', year: 0 },
    { label: '1年まで', year: 1 },
    { label: '2年まで', year: 2 },
    { label: '3年まで', year: 3 }
  ];
  var validCourse = new Set(D.courses.map(function (c) { return c.id; }));

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function cn(id) { return L.cmap.get(id).name.split(/[（(]/)[0]; }
  function idsUpTo(y) { return D.courses.filter(function (c) { return c.year <= y; }).map(function (c) { return c.id; }); }

  // ---- 保存(使えない環境でも動くようにする) ----
  function load() {
    var s = { courses: [], cat: 'all', open: false, saved: false };
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var o = JSON.parse(raw);
        s.saved = true;
        if (Array.isArray(o.courses)) s.courses = o.courses.filter(function (id) { return validCourse.has(id); });
        if (o.cat === 'all' || D.categories.indexOf(o.cat) >= 0) s.cat = o.cat;
      }
    } catch (e) { /* 保存なしで続ける */ }
    return s;
  }
  function save() {
    S.saved = true;
    try { localStorage.setItem(KEY, JSON.stringify({ courses: S.courses, cat: S.cat })); } catch (e) { /* 無視 */ }
  }
  var S = load();

  function sameSet(a, b) { return a.length === b.length && a.every(function (x) { return b.indexOf(x) >= 0; }); }
  function currentStage() {
    for (var i = 0; i < STAGES.length; i++) if (sameSet(S.courses, idsUpTo(STAGES[i].year))) return i;
    return -1;
  }
  function stageName() {
    var st = currentStage();
    return (st >= 0 ? STAGES[st].label : '自分で選択') + '(' + S.courses.length + '科目)';
  }

  // ---- 画面の行き来 ----
  var cur, lastList = 'recommend', fromApp = false, scrolls = {};
  function parse(h) {
    var s = String(h || '').replace(/^#/, '');
    if (s === 'home' || s === 'recommend' || s === 'shelf') return s;
    if (/^book-/.test(s) && L.bmap.has(s.slice(5))) return s;
    return null;
  }
  function go(r) {
    if (r === cur) return;
    scrolls[cur] = window.scrollY;
    cur = r;
    try { location.hash = r; } catch (e) { /* 履歴に残せなくても画面は切り替える */ }
    fromApp = location.hash === '#' + r;
    show(true);
  }
  function back() {
    if (fromApp) { try { history.back(); return; } catch (e) { /* 下で戻る */ } }
    go(lastList);
  }
  window.addEventListener('hashchange', function () {
    var n = parse(location.hash) || 'home';
    if (n === cur) return;
    scrolls[cur] = window.scrollY;
    cur = n;
    show(false);
  });
  function show(forward) {
    render(true);
    window.scrollTo(0, forward ? 0 : (scrolls[cur] || 0));
  }

  // ---- 部品 ----
  function statusText(info) {
    if (info.status === 'ready') return 'いま読めます';
    if (info.status === 'near') return 'あと' + info.gap + '件で読めます';
    return '前提があと' + info.gap + '件';
  }
  function whyFit(r) {
    var names = r.fresh.slice(0, 2).map(cn).join('、');
    var more = r.fresh.length > 2 ? ' ほか' + (r.fresh.length - 2) + '件' : '';
    return '前提はそろっています。新しく学べること: ' + names + more;
  }
  function whyNext(r) {
    var parts = r.info.missing.map(function (id) {
      var cs = L.coursesFor(id);
      return cn(id) + (cs.length ? '(' + cs[0] + 'で学べます)' : '(自習)');
    }).concat(r.info.unmet.map(function (t) { return '先に『' + t + '』を読む'; }));
    return 'あと' + r.info.gap + '件で読めます。足りない知識: ' + parts.join('、');
  }
  function recHtml(r, why) {
    var b = r.b;
    return '<button class="rec" data-book="' + b.id + '" data-k="rc-' + b.id + '">' +
      '<span class="mini s-' + r.info.status + '" aria-hidden="true"><span>' + LEVELS[r.info.level] + '</span></span>' +
      '<span class="rec-body"><span class="rec-title">' + esc(b.title) + '</span>' +
      '<span class="rec-meta">' + esc(b.category) + '・' + LEVELS[r.info.level] + (b.author ? '・' + esc(b.author) : '') + '</span>' +
      '<span class="rec-why">' + esc(why(r)) + '</span></span></button>';
  }
  function nowLine() {
    return '<p class="now"><span>いまの選択: <b>' + esc(stageName()) + '</b></span>' +
      '<button class="link" data-go="home" data-k="chg">授業を変える</button></p>';
  }
  function catsHtml() {
    var h = '<div class="cats" role="group" aria-label="分野">';
    ['all'].concat(D.categories).forEach(function (c, i) {
      var n = c === 'all' ? D.books.length : D.books.filter(function (b) { return b.category === c; }).length;
      h += '<button data-cat="' + esc(c) + '" data-k="ct-' + i + '" aria-pressed="' + (S.cat === c) + '">' +
        (c === 'all' ? 'すべて' : esc(c)) + '<i>' + n + '</i></button>';
    });
    return h + '</div>';
  }
  function barHtml() {
    var tab = cur.indexOf('book-') === 0 ? lastList : cur;
    var tabs = [['home', '授業'], ['recommend', 'おすすめ'], ['shelf', '本棚']];
    return '<div class="bar"><div class="wrap bar-in">' +
      (cur === 'home' ? '<span></span>' : '<button class="brand" data-go="home" data-k="brand">レベル合わせるぞい</button>') +
      '<nav class="tabs" aria-label="画面の切り替え">' + tabs.map(function (t) {
        return '<button data-go="' + t[0] + '" data-k="tab-' + t[0] + '"' + (t[0] === tab ? ' aria-current="page"' : '') + '>' + t[1] + '</button>';
      }).join('') + '</nav></div></div>';
  }

  // ---- 画面1: 授業 ----
  function homeHtml() {
    var stage = currentStage();
    var h = '<header class="wrap mast"><h1 class="ttl" id="ttl" tabindex="-1">レベル合わせるぞい</h1>' +
      '<p>受けた授業から、いまのあなたに合う武蔵野大学6階の技術書を探します。</p></header>';
    h += '<main><section class="wrap block" aria-labelledby="h-stage"><h2 id="h-stage">どこまで授業を受けましたか</h2>' +
      '<p class="lead">近いものを1つ選んで、下のボタンを押してください。</p><div class="stairs">';
    STAGES.forEach(function (st, i) {
      var cls = 'step' + (stage === i ? ' on' : stage > i ? ' done' : '');
      h += '<button class="' + cls + '" data-stage="' + i + '" data-k="st' + i + '" aria-pressed="' + (stage === i) + '">' +
        '<b>' + st.label + '</b><small>' + idsUpTo(st.year).length + '科目</small></button>';
    });
    h += '</div>';
    h += '<button class="link" data-act="toggle" data-k="tg" aria-expanded="' + S.open + '">' +
      (S.open ? '授業の選択を閉じる' : '授業を1つずつ選ぶ') + '(いま' + S.courses.length + '科目)</button>';
    if (S.open) {
      h += '<div class="years">';
      [1, 2, 3].forEach(function (y) {
        var cs = D.courses.filter(function (c) { return c.year === y; });
        if (!cs.length) return;
        h += '<div><h3>' + y + '年次</h3><div class="tags">';
        cs.forEach(function (c) {
          h += '<button class="course" data-course="' + c.id + '" data-k="co-' + c.id + '" aria-pressed="' + (S.courses.indexOf(c.id) >= 0) + '">' + esc(c.name) + '</button>';
        });
        h += '</div></div>';
      });
      h += '</div>';
    }
    h += '<button class="go" data-go="recommend" data-k="go">この内容でおすすめを見る</button></section></main>';
    h += '<div class="wrap about"><details><summary>このサイトのしくみ</summary><div class="about-in">' +
      '<p>本ごとに「読む前に必要な知識」をAIが推定しています。必要な知識の数で、入門(0個)・基礎(1〜3個)・応用(4〜7個)・発展(8個以上、または別の本の続き)に分けています。</p>' +
      '<p>背表紙の色は、選んだ授業で身につく知識と比べて決めます。足りない知識が0個なら緑、1〜2個なら黄、3個以上なら灰色です。</p>' +
      '<p>「あなたに合う本」は、緑の本から新しく学べることが多く少し背伸びになる本を3冊まで選びます。黄色の本からは、足りない知識が少ない順に2冊まで出します。</p>' +
      '<p>選んだ授業と分野は、このブラウザの中にだけ保存されます。外部には送りません。</p>' +
      '<p>知識のタグはAIによる推定で、人の確認はまだです。実際の内容は、本を手に取って確かめてください。</p>' +
      '<button class="btn" data-act="reset" data-k="rs">保存した選択を消す</button></div></details></div>';
    h += '<footer><div class="wrap">武蔵野大学6階の技術書を、前提知識の近さで並べています。書名・著者・出版社・要旨のみを載せ、本文は載せていません。</div></footer>';
    return h;
  }

  // ---- 画面2: おすすめ ----
  function recommendHtml(ks) {
    var rec = L.recommend(ks, S.cat);
    var h = '<div class="wrap page"><div><h1 class="page-h ttl" id="ttl" tabindex="-1">あなたに合う本</h1>' + nowLine() + '</div>' + catsHtml();
    h += '<section class="block"><div class="recs-head"><h2>いま読む本</h2><p class="lead">前提がそろっていて、新しく学べることが多い順に、分野が偏らないよう選んでいます。</p></div>';
    h += rec.fit.length
      ? '<div class="recs">' + rec.fit.map(function (r) { return recHtml(r, whyFit); }).join('') + '</div>'
      : '<p class="empty">この条件で、いま読める本は見つかりませんでした。分野を「すべて」にするか、授業を増やしてみてください。</p>';
    h += '</section><section class="block"><div class="recs-head"><h2>あと少しで読める本</h2><p class="lead">足りない知識が1〜2件で届く本です。</p></div>';
    h += rec.next.length
      ? '<div class="recs">' + rec.next.map(function (r) { return recHtml(r, whyNext); }).join('') + '</div>'
      : '<p class="empty">あと少しで読める本は、いまのところありません。</p>';
    h += '</section><button class="go alt" data-go="shelf" data-k="to-shelf">6階の本棚で全部見る</button></div>';
    return h;
  }

  // ---- 画面3: 本棚 ----
  function shelfHtml(ks) {
    var books = D.books.filter(function (b) { return S.cat === 'all' || b.category === S.cat; });
    var infos = new Map();
    D.books.forEach(function (b) { infos.set(b.id, L.bookInfo(b, ks)); });
    var readyN = books.filter(function (b) { return infos.get(b.id).status === 'ready'; }).length;
    var h = '<section class="cabinet"><div class="wrap">' +
      '<div class="block"><h1 class="page-h ttl" id="ttl" tabindex="-1">6階の本棚</h1>' + nowLine() +
      '<p class="lead">棚の段が難しさ、背表紙の色があなたとの距離です。' + (S.cat === 'all' ? '全' : esc(S.cat) + 'の') +
      books.length + '冊のうち、いま読める本は' + readyN + '冊。本を選ぶと詳しく見られます。</p></div>' + catsHtml() +
      '<div class="legend"><span><i class="s-ready"></i>いま読める</span><span><i class="s-near"></i>あと1〜2件の知識で読める</span><span><i class="s-prep"></i>前提がまだ多い</span></div>';
    LEVELS.forEach(function (name, lv) {
      var row = books.filter(function (b) { return infos.get(b.id).level === lv; })
        .sort(function (a, b) {
          return D.categories.indexOf(a.category) - D.categories.indexOf(b.category) || a.short.localeCompare(b.short, 'ja');
        });
      if (!row.length) return;
      h += '<div class="shelf"><div class="shelf-head"><h2>' + name + '</h2><p>' + LEVEL_NOTE[lv] + '(' + row.length + '冊)</p></div><div class="rack">';
      row.forEach(function (b) {
        var info = infos.get(b.id);
        h += '<button class="spine s-' + info.status + '" data-book="' + b.id + '" data-k="bk-' + b.id + '" title="' + esc(b.title) + '" ' +
          'aria-label="' + esc(b.title) + '、' + name + '、' + statusText(info) + '"><span>' + esc(b.short) + '</span></button>';
      });
      h += '</div></div>';
    });
    return h + '<button class="go alt" data-go="recommend" data-k="to-rec">あなたに合う本を見る</button></div></section>';
  }

  // ---- 画面4: 本の詳細 ----
  function detailHtml(id, ks) {
    var b = L.bmap.get(id), info = L.bookInfo(b, ks);
    var h = '<div class="wrap page detail"><button class="link" data-act="back" data-k="back">' + (lastList === 'shelf' ? '本棚にもどる' : 'おすすめにもどる') + '</button>';
    h += '<div class="detail-head"><span class="mini s-' + info.status + '" aria-hidden="true"><span>' + LEVELS[info.level] + '</span></span><div>' +
      '<h1 class="ttl" id="ttl" tabindex="-1">' + esc(b.title) + '</h1>' +
      '<p class="by">' + [b.author, b.publisher, b.year ? b.year + '年' : null].filter(Boolean).map(esc).join(' / ') + '</p></div></div>';
    h += '<div class="chips-row"><span class="chip">' + LEVELS[info.level] + '</span><span class="chip s-' + info.status + '">' + statusText(info) + '</span></div>';
    h += '<section><h3>想定している読者</h3><p>' + esc(b.audience) + '</p></section>';
    h += '<section><h3>この本で学べること</h3><div class="concepts">' + b.teaches.map(function (t) { return '<span>' + esc(cn(t)) + '</span>'; }).join('') + '</div></section>';
    h += '<section><h3>先に必要な知識</h3>';
    if (info.gap === 0) {
      h += '<p class="ok-line">' + (info.need.length ? '選んだ授業で、前提はそろっています。' : '前提になる知識は要りません。') + '</p>';
    } else {
      h += '<div class="concepts">' + info.missing.map(function (m) { return '<span>' + esc(cn(m)) + '</span>'; }).join('') +
        info.unmet.map(function (t) { return '<span>『' + esc(t) + '』</span>'; }).join('') + '</div>';
    }
    h += '</section>';
    if (info.gap > 0) {
      var r = L.route(b, ks);
      h += '<section><h3>おすすめの順番</h3><ol class="steps">';
      r.selfStudy.forEach(function (s) {
        h += '<li><span class="k">' + (s.courses.length ? '授業・自習' : '自習') + '</span><span>' + esc(cn(s.id)) +
          (s.courses.length ? '<br><span class="small">' + s.courses.slice(0, 2).map(function (c) { return '「' + esc(c) + '」'; }).join('') + 'で学べます</span>' : '') + '</span></li>';
      });
      r.books.forEach(function (p) {
        h += '<li><span class="k">先に読む</span><span><button class="link inline" data-book="' + p.id + '">『' + esc(p.title) + '』</button></span></li>';
      });
      h += '<li class="goal"><span class="k">めざす本</span><span><b>' + esc(b.title) + '</b></span></li></ol></section>';
    }
    var conf = { high: '高', medium: '中', low: '低' }[b.confidence] || '中';
    return h + '<p class="small">この本の前提知識の推定の確かさ: ' + conf + '。AIによる推定で、人の確認はまだです。</p></div>';
  }

  // ---- 描画 ----
  function render(changed) {
    if (cur === 'recommend' || cur === 'shelf') lastList = cur;
    var ks = L.knownState(S);
    var focusKey = !changed && document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.k : null;
    var body = cur === 'home' ? homeHtml()
      : cur === 'recommend' ? recommendHtml(ks)
      : cur === 'shelf' ? shelfHtml(ks)
      : detailHtml(cur.slice(5), ks);
    app.innerHTML = barHtml() + '<div id="screen">' + body + '</div>';
    var screen = document.getElementById('screen');
    if (changed) {
      screen.classList.add('enter');
      var t = document.getElementById('ttl');
      if (t) t.focus({ preventScroll: true });
    } else if (focusKey) {
      var els = app.querySelectorAll('[data-k]');
      for (var i = 0; i < els.length; i++) if (els[i].dataset.k === focusKey) { els[i].focus({ preventScroll: true }); break; }
    }
  }

  // ---- 操作 ----
  app.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('button') : null;
    if (!t) return;
    var d = t.dataset;
    if (d.go) {
      go(d.go);
    } else if (d.book) {
      go('book-' + d.book);
    } else if (d.act === 'back') {
      back();
    } else if (d.stage !== undefined) {
      S.courses = idsUpTo(STAGES[+d.stage].year);
      save(); render(false);
    } else if (d.course) {
      var i = S.courses.indexOf(d.course);
      if (i >= 0) S.courses.splice(i, 1); else S.courses.push(d.course);
      save(); render(false);
    } else if (d.cat !== undefined) {
      S.cat = d.cat; save(); render(false);
    } else if (d.act === 'toggle') {
      S.open = !S.open; render(false);
    } else if (d.act === 'reset') {
      S = { courses: [], cat: 'all', open: false, saved: false };
      try { localStorage.removeItem(KEY); } catch (err) { /* 無視 */ }
      render(false);
    }
  });

  // 最初の画面: 前回の続きがあればおすすめから、なければ授業の選択から
  cur = parse(location.hash);
  if (!cur) {
    cur = S.saved ? 'recommend' : 'home';
    if (cur !== 'home') { try { history.replaceState(null, '', '#' + cur); } catch (e) { /* 無視 */ } }
  }
  render(false);
  window.scrollTo(0, 0);
})();

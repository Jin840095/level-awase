/* レベル合わせるぞい: 判定ロジック(画面に依存しない関数だけ) */
(function (root) {
  'use strict';

  function build(D) {
    var concepts = D.concepts, books = D.books, courses = D.courses;
    var cmap = new Map(concepts.map(function (c) { return [c.id, c]; }));
    var bmap = new Map(books.map(function (b) { return [b.id, b]; }));
    var byTitle = new Map(books.map(function (b) { return [b.title, b]; }));

    // 概念 id とその前提すべて(自分を含む)
    var upCache = new Map();
    function up(id) {
      if (upCache.has(id)) return upCache.get(id);
      var s = new Set([id]);
      upCache.set(id, s); // 循環があっても止まるように先に登録
      var c = cmap.get(id);
      if (c) c.requires.forEach(function (r) { up(r).forEach(function (x) { s.add(x); }); });
      return s;
    }
    function upAll(ids) {
      var s = new Set();
      ids.forEach(function (i) { up(i).forEach(function (x) { s.add(x); }); });
      return s;
    }

    var depthCache = new Map();
    function depth(id) {
      if (depthCache.has(id)) return depthCache.get(id);
      depthCache.set(id, 0);
      var c = cmap.get(id);
      var d = c && c.requires.length ? 1 + Math.max.apply(null, c.requires.map(depth)) : 0;
      depthCache.set(id, d);
      return d;
    }

    // 本が前提とする概念(前提の前提も含む)/ 本で身につく概念(その前提も含む)
    var needCache = new Map(), teachCache = new Map();
    function bookNeed(b) {
      if (!needCache.has(b.id)) needCache.set(b.id, upAll(b.requires));
      return needCache.get(b.id);
    }
    function teachSet(b) {
      if (!teachCache.has(b.id)) teachCache.set(b.id, upAll(b.teaches));
      return teachCache.get(b.id);
    }

    // 難易度帯: 0=入門 1=基礎 2=応用 3=発展
    // 前提概念の数(前提の前提を含む)で決め、先に読む本があればその本より一段上にする
    var levelCache = new Map();
    function levelOf(b) {
      if (levelCache.has(b.id)) return levelCache.get(b.id);
      levelCache.set(b.id, 0);
      var n = bookNeed(b).size;
      var lv = n === 0 ? 0 : n <= 3 ? 1 : n <= 7 ? 2 : 3;
      (b.book_requires || []).forEach(function (t) {
        var p = byTitle.get(t);
        if (p) lv = Math.max(lv, Math.min(3, levelOf(p) + 1));
      });
      levelCache.set(b.id, lv);
      return lv;
    }

    // 受けた授業から、いま持っている概念を求める
    function knownState(S) {
      var courseSet = new Set(S.courses);
      var direct = new Set();
      courses.forEach(function (co) {
        if (courseSet.has(co.id)) co.teaches.forEach(function (t) { direct.add(t); });
      });
      return { known: upAll(direct) };
    }

    function bookInfo(b, ks) {
      var need = Array.from(bookNeed(b)).sort(function (a, c) { return depth(a) - depth(c); });
      var missing = need.filter(function (id) { return !ks.known.has(id); });
      var unmet = (b.book_requires || []).filter(function (t) { return byTitle.has(t); });
      var gap = missing.length + unmet.length;
      return {
        need: need, missing: missing, unmet: unmet, gap: gap,
        status: gap === 0 ? 'ready' : gap <= 2 ? 'near' : 'prep',
        level: levelOf(b)
      };
    }

    function coursesFor(conceptId) {
      return courses.filter(function (c) { return c.teaches.indexOf(conceptId) >= 0; })
        .map(function (c) { return c.name; });
    }

    // 目標の本までの読書ルート(足りない概念を、授業・自習・先に読む本で埋める順番)
    function route(target, ks) {
      var known = new Set(ks.known);
      var order = [];
      var selfMap = new Map();
      var seen = new Set([target.id]);

      function visit(b) {
        (b.book_requires || []).forEach(function (t) {
          var p = byTitle.get(t);
          if (p && !seen.has(p.id)) {
            seen.add(p.id);
            visit(p);
            order.push(p);
            teachSet(p).forEach(function (x) { known.add(x); });
          }
        });
        var need = Array.from(bookNeed(b)).sort(function (a, c) { return depth(a) - depth(c); });
        need.forEach(function (m) {
          if (known.has(m)) return;
          var cands = books.filter(function (p) {
            return !seen.has(p.id) && levelOf(p) < levelOf(b) && p.teaches.indexOf(m) >= 0;
          }).sort(function (x, y) { return levelOf(x) - levelOf(y) || x.title.localeCompare(y.title); });
          if (cands.length) {
            var p = cands[0];
            seen.add(p.id);
            visit(p);
            order.push(p);
            teachSet(p).forEach(function (x) { known.add(x); });
          } else if (!selfMap.has(m)) {
            selfMap.set(m, coursesFor(m));
          }
        });
      }
      visit(target);
      var selfStudy = [];
      selfMap.forEach(function (cs, id) { selfStudy.push({ id: id, courses: cs }); });
      selfStudy.sort(function (a, c) { return depth(a.id) - depth(c.id); });
      return { books: order, selfStudy: selfStudy };
    }

    // ---- おすすめ ----
    var CONF = { high: 1, medium: 0.5, low: 0 };
    function fresh(b, ks) { return b.teaches.filter(function (t) { return !ks.known.has(t); }); }

    // 同じ分野に偏らないように、点数から「すでに選んだ同分野の本」ぶんを引いて1冊ずつ選ぶ
    function pick(cands, n) {
      var chosen = [], perCat = {};
      var pool = cands.slice();
      while (chosen.length < n && pool.length) {
        var best = -1, bestScore = -Infinity;
        for (var i = 0; i < pool.length; i++) {
          var s = pool[i].score - 2 * (perCat[pool[i].b.category] || 0);
          if (s > bestScore) { bestScore = s; best = i; }
        }
        var it = pool.splice(best, 1)[0];
        perCat[it.b.category] = (perCat[it.b.category] || 0) + 1;
        chosen.push(it);
      }
      return chosen;
    }

    /* 今すぐ読める本のうち、新しく学べることが多く、少し背伸びになる本を fit に、
       足りない前提が1〜2件で届く本を next に返す。分野(cat)で絞れる。 */
    function recommend(ks, cat) {
      var rows = books.filter(function (b) { return !cat || cat === 'all' || b.category === cat; })
        .map(function (b) {
          var info = bookInfo(b, ks), fr = fresh(b, ks);
          return { b: b, info: info, fresh: fr, score: fr.length * 2 + info.level * 1.5 + CONF[b.confidence] };
        })
        .filter(function (r) { return r.fresh.length > 0; })
        .sort(function (x, y) { return y.score - x.score || x.b.title.localeCompare(y.b.title); });
      var fit = pick(rows.filter(function (r) { return r.info.status === 'ready'; }), 3);
      var next = pick(rows.filter(function (r) { return r.info.status === 'near'; })
        .map(function (r) { return Object.assign({}, r, { score: r.score - r.info.gap * 1.5 }); }), 2);
      return { fit: fit, next: next };
    }

    return {
      cmap: cmap, bmap: bmap, byTitle: byTitle,
      up: up, upAll: upAll, depth: depth, bookNeed: bookNeed, teachSet: teachSet,
      levelOf: levelOf, knownState: knownState, bookInfo: bookInfo, route: route,
      coursesFor: coursesFor, recommend: recommend
    };
  }

  var api = { build: build };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LV = api;
})(typeof window !== 'undefined' ? window : globalThis);

const fs = require('fs');
const path = require('path');
const { build } = require('./logic.js');
const D = JSON.parse(fs.readFileSync(path.join(__dirname, 'data.json'), 'utf8'));
const L = build(D);
let fail = 0;
const ok = (cond, msg) => { if (!cond) { fail++; console.log('FAIL:', msg); } else console.log('ok  :', msg); };
const byT = t => D.books.find(b => b.title === t);
const coursesUpTo = y => D.courses.filter(c => c.year <= y).map(c => c.id);
const state = y => L.knownState({ courses: coursesUpTo(y) });

// クイズの名残がデータに無い
ok(!('quiz' in D), 'データにクイズが含まれない');
ok(!L.quizForBook && !L.quizMix, '判定ロジックにクイズ関数がない');

// 難易度帯
const LV = ['入門', '基礎', '応用', '発展'];
ok(L.levelOf(byT('プログラムはなぜ動くのか')) === 0, 'プログラムはなぜ動くのか=入門');
ok(L.levelOf(byT('コンピュータの構成と設計(上)')) === 1, '構成と設計(上)=基礎');
ok(L.levelOf(byT('コンピュータの構成と設計(下)')) === 2, '構成と設計(下)=応用(上巻の次)');

// 授業の選択で知っている概念が増える
const k0 = state(0), k1 = state(1), k3 = state(3);
ok(k0.known.size === 0, '授業なしなら知っている概念は0');
ok(k1.known.size > 0 && k3.known.size >= k1.known.size, '学年が上がると知っている概念が増える');
const readyN = ks => D.books.filter(b => L.bookInfo(b, ks).status === 'ready').length;
ok(readyN(k0) <= readyN(k1) && readyN(k1) <= readyN(k3), `読める本は学年が上がっても減らない(${readyN(k0)}→${readyN(k1)}→${readyN(k3)})`);

// おすすめ
for (const y of [0, 1, 2, 3]) {
  const ks = state(y), r = L.recommend(ks, 'all');
  const ids = r.fit.concat(r.next).map(x => x.b.id);
  ok(new Set(ids).size === ids.length, `${y}年: おすすめに重複がない`);
  ok(r.fit.length > 0, `${y}年: 今すぐ読めるおすすめが1冊以上(${r.fit.length}冊)`);
  ok(r.fit.every(x => x.info.status === 'ready' && x.fresh.length > 0), `${y}年: fit は読める本で、新しく学べることがある`);
  ok(r.fit.every(x => x.b.teaches.some(t => !ks.known.has(t))), `${y}年: fit に「すでに全部学んだ本」を入れない`);
  ok(r.next.every(x => x.info.status === 'near' && x.info.gap >= 1 && x.info.gap <= 2), `${y}年: next は足りない前提が1〜2件`);
  if (r.fit.length === 3) ok(new Set(r.fit.map(x => x.b.category)).size >= 2, `${y}年: fit が1つの分野に偏らない`);
}
// 分野で絞る
for (const cat of D.categories) {
  const r = L.recommend(state(2), cat);
  ok(r.fit.concat(r.next).every(x => x.b.category === cat), `分野「${cat}」で絞ると、その分野の本だけ`);
}
// 学年が進むと、おすすめが入れ替わる
const t0 = L.recommend(state(0), 'all').fit.map(x => x.b.id).join(), t3 = L.recommend(state(3), 'all').fit.map(x => x.b.id).join();
ok(t0 !== t3, '授業を受けていない場合と3年次では、おすすめが変わる');
// 難しい本は、条件が足りないと読める本に入らない
ok(L.bookInfo(byT('コンピュータの構成と設計(下)'), state(3)).status !== 'ready', '先に読む本がある続きの本は「今すぐ読める」にならない');

// ルート
const r = L.route(byT('評価指標入門'), k0);
ok(r.selfStudy.length + r.books.length > 0, '評価指標入門は、授業なしだと足りない前提と順番が出る');
ok(!r.books.some(b => b.title === '達人プログラマー'), 'ルートに、前提を直接教えない本(達人プログラマー)を入れない');
const r2 = L.route(byT('コンピュータの構成と設計(下)'), k1);
ok(r2.books.some(b => b.title === 'コンピュータの構成と設計(上)'), '下巻のルートに上巻が出る');

// 背表紙の短い題名
ok(D.books.every(b => b.short && b.short.length <= 16), '背表紙の題名は全冊16字以内');
ok(D.books.every(b => ['ready'].concat(['near', 'prep']).includes(L.bookInfo(b, k1).status)), '全冊に状態がつく');

console.log('\n--- 1年次までのおすすめ');
const rr = L.recommend(k1, 'all');
rr.fit.forEach(x => console.log('fit :', x.b.short, '|', x.b.category, '|', LV[x.info.level], '| 新しく:', x.fresh.map(i => L.cmap.get(i).name.split(/[（(]/)[0]).join('、')));
rr.next.forEach(x => console.log('next:', x.b.short, '| 足りない:', x.info.missing.map(i => L.cmap.get(i).name.split(/[（(]/)[0]).join('、'), x.info.unmet.join('、')));
console.log(fail ? `\n${fail}件失敗` : '\nすべて成功');
process.exit(fail ? 1 : 0);

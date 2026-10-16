"""library.db(SQLite)から、サイトに埋め込む data.json を作る。作る前に中身を検査する。"""
import json, os, sqlite3, sys
HERE = os.path.dirname(os.path.abspath(__file__)) + '/'
DB = HERE + 'library.db'
if not os.path.exists(DB):
    print('library.db がありません。先に python3 migrate_from_json.py を実行してください。'); sys.exit(1)

con = sqlite3.connect('file:' + DB + '?mode=ro', uri=True)
con.row_factory = sqlite3.Row
q = lambda sql, *a: con.execute(sql, a).fetchall()

def group(sql):
    d = {}
    for k, v in con.execute(sql):
        d.setdefault(k, []).append(v)
    return d

req = group('SELECT concept_id, requires_id FROM concept_requires ORDER BY rowid')
concepts = [{'id': r['id'], 'name': r['name'], 'category': r['category'], 'requires': req.get(r['id'], [])}
            for r in q('SELECT * FROM concept ORDER BY rowid')]
ctaught = group('SELECT course_id, concept_id FROM course_teaches ORDER BY rowid')
courses = [{'id': 'c%02d' % r['id'], 'name': r['name'], 'year': r['year'], 'teaches': ctaught.get(r['id'], [])}
           for r in q('SELECT * FROM course ORDER BY id')]
excluded = [{'name': r['name'], 'code': r['code'], 'reason': r['reason']} for r in q('SELECT * FROM excluded_course ORDER BY rowid')]

breq = group('SELECT book_id, concept_id FROM book_requires ORDER BY rowid')
bteach = group('SELECT book_id, concept_id FROM book_teaches ORDER BY rowid')
title_of = {r['id']: r['title'] for r in q('SELECT id, title FROM book')}
bpre = group('SELECT book_id, prereq_book_id FROM book_prereq_book ORDER BY rowid')
books = []
for r in q('SELECT * FROM book ORDER BY id'):
    books.append({
        'id': 'b%d' % r['id'], 'title': r['title'], 'short': r['short'], 'category': r['category'],
        'author': r['author'], 'publisher': r['publisher'], 'year': r['year'], 'title_basis': r['title_basis'],
        'requires': breq.get(r['id'], []), 'teaches': bteach.get(r['id'], []),
        'book_requires': [title_of[i] for i in bpre.get(r['id'], [])],
        'audience': r['audience'], 'stated_prerequisite': r['stated_prerequisite'], 'evidence': r['evidence'],
        'confidence': r['confidence'], 'note': r['note'], 'verified': bool(r['verified']),
    })

# ---- 検査(外部キーで防げない内容の誤りを探す) ----
errors, warnings = [], []
rq = {c['id']: c['requires'] for c in concepts}
def has_cycle(n, stack):
    return n in stack or any(has_cycle(m, stack | {n}) for m in rq[n])
if any(has_cycle(n, set()) for n in rq): errors.append('概念の前提が循環しています')
for b in books:
    if not b['teaches']: errors.append(f"『{b['title']}』に「身につく概念」がありません")
    if set(b['requires']) & set(b['teaches']): warnings.append(f"『{b['title']}』は、前提と習得に同じ概念が入っています(続き物なら問題ありません)")
bt = {b['id']: b for b in books}
def book_cycle(t, stack):
    return t in stack or any(book_cycle(x, stack | {t}) for x in bt[t]['book_requires_ids'])
for b in books: b['book_requires_ids'] = [next(k for k, v in bt.items() if v['title'] == t) for t in b['book_requires']]
if any(book_cycle(i, set()) for i in bt): errors.append('先に読む本が循環しています')
for b in books: del b['book_requires_ids']
for c in courses:
    if not c['teaches']: errors.append(f"授業「{c['name']}」に概念が1つもありません")
if errors:
    print('エラー:'); [print(' -', e) for e in errors]; sys.exit(1)

for w in warnings: print('注意:', w)
cats = ['情報基礎', 'プログラミング', '統計', 'データベース', '機械学習', '深層学習', '自然言語処理']
used = {b['category'] for b in books}
cats = [c for c in cats if c in used] + sorted(used - set(cats))
json.dump({'concepts': concepts, 'courses': courses, 'books': books, 'categories': cats, 'excluded': excluded},
          open(HERE + 'data.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('ok', len(concepts), '概念', len(courses), '授業', len(books), '冊', cats)

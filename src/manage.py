"""本・授業データ(library.db)の管理ツール。
  python3 manage.py list [分野]        本の一覧
  python3 manage.py show 題名の一部     1冊の詳しい中身
  python3 manage.py concepts [語]      概念を探す(本に入れる概念の id を調べる)
  python3 manage.py add                本を1冊足す(質問に答えるだけ)
  python3 manage.py edit 番号 項目 値   本の項目を直す(例: edit 12 author 山田太郎)
  python3 manage.py delete 番号         本を消す(確認あり)
  python3 manage.py check              データの検査
  python3 manage.py build              検査して index.html を作り直す
"""
import os, sqlite3, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__)) + '/'
con = sqlite3.connect(HERE + 'library.db')
con.execute('PRAGMA foreign_keys = ON')
con.row_factory = sqlite3.Row
EDITABLE = ['title', 'short', 'category', 'author', 'publisher', 'year', 'title_basis', 'audience',
            'stated_prerequisite', 'evidence', 'confidence', 'note', 'verified']

def ask(label, default=None, required=False):
    while True:
        s = input(f'{label}{f" [{default}]" if default not in (None, "") else ""}: ').strip()
        if not s and default is not None: return default
        if s or not required: return s
        print('  入力してください。')

def find_books(key):
    if key.isdigit():
        return con.execute('SELECT * FROM book WHERE id=?', (int(key),)).fetchall()
    return con.execute('SELECT * FROM book WHERE title LIKE ? OR short LIKE ?', (f'%{key}%', f'%{key}%')).fetchall()

def one_book(key):
    rows = find_books(key)
    if not rows: print('見つかりません:', key); sys.exit(1)
    if len(rows) > 1:
        print('複数見つかりました。番号で指定してください:')
        for r in rows: print(f"  {r['id']:>3}  {r['title']}")
        sys.exit(1)
    return rows[0]

def concept_name(i): return con.execute('SELECT name FROM concept WHERE id=?', (i,)).fetchone()[0]

def resolve(token):
    """概念を id・名前・一部の語から1つに決める(曖昧なら選んでもらう)"""
    r = con.execute('SELECT id FROM concept WHERE id=? OR name=?', (token, token)).fetchone()
    if r: return r[0]
    hits = con.execute('SELECT id, name FROM concept WHERE id LIKE ? OR name LIKE ? ORDER BY rowid', (f'%{token}%', f'%{token}%')).fetchall()
    if not hits: print(f'  「{token}」に当てはまる概念がありません(concepts コマンドで探せます)'); return None
    if len(hits) == 1:
        print(f'  「{token}」→ {hits[0]["name"]}'); return hits[0]['id']
    print(f'  「{token}」に当てはまる概念:')
    for n, h in enumerate(hits, 1): print(f'   {n}. {h["name"]}  ({h["id"]})')
    s = input('   番号(なしなら空欄): ').strip()
    return hits[int(s) - 1]['id'] if s.isdigit() and 1 <= int(s) <= len(hits) else None

def ask_concepts(label):
    while True:
        raw = input(f'{label}(カンマ区切り。id・名前・一部の語): ').strip()
        out = []
        for t in [x.strip() for x in raw.replace('、', ',').split(',') if x.strip()]:
            c = resolve(t)
            if c and c not in out: out.append(c)
        if out or not raw: return out

def cmd_list(args):
    sql, a = 'SELECT id, title, category FROM book', ()
    if args: sql, a = sql + ' WHERE category=?', (args[0],)
    for r in con.execute(sql + ' ORDER BY id', a): print(f"{r['id']:>3}  [{r['category']}] {r['title']}")

def cmd_show(args):
    b = one_book(' '.join(args))
    for k in b.keys(): print(f'{k:>20}: {b[k]}')
    for label, t in (('前提の概念', 'book_requires'), ('身につく概念', 'book_teaches')):
        names = [concept_name(r[0]) for r in con.execute(f'SELECT concept_id FROM {t} WHERE book_id=? ORDER BY rowid', (b['id'],))]
        print(f'{label:>20}: {"、".join(names)}')
    pre = [r[0] for r in con.execute('SELECT b.title FROM book_prereq_book p JOIN book b ON b.id=p.prereq_book_id WHERE p.book_id=?', (b['id'],))]
    if pre: print(f'{"先に読む本":>20}: {"、".join(pre)}')

def cmd_concepts(args):
    k = args[0] if args else ''
    for r in con.execute('SELECT id, name, category FROM concept WHERE id LIKE ? OR name LIKE ? OR category LIKE ? ORDER BY rowid', (f'%{k}%',) * 3):
        print(f"{r['id']:<22} {r['name']}  [{r['category']}]")

def cmd_add(_):
    cats = [r[0] for r in con.execute('SELECT category FROM book GROUP BY category ORDER BY MIN(id)')]
    print('本を1冊足します。空欄でよい項目は、そのままEnterを押してください。')
    title = ask('題名(正式なもの)', required=True)
    if con.execute('SELECT 1 FROM book WHERE title=?', (title,)).fetchone(): print('同じ題名の本がすでにあります。'); return
    short = ask('背表紙の短い題名(16字まで)', title if len(title) <= 16 else None, required=True)
    while len(short) > 16: short = ask('  16字以内で', required=True)
    print('分野の例:', '、'.join(cats))
    category = ask('分野', required=True)
    author, publisher = ask('著者'), ask('出版社')
    year = ask('出版年(数字)')
    audience = ask('想定読者'); stated = ask('本に書かれた前提知識'); evidence = ask('根拠(まえがき何ページなど)')
    conf = ask('前提の推定の確かさ high / medium / low', 'medium')
    if conf not in ('high', 'medium', 'low'): conf = 'medium'
    note = ask('メモ'); basis = ask('題名をどう特定したか')
    req = ask_concepts('読む前に必要な概念'); teach = ask_concepts('読むと身につく概念')
    while not teach: print('  身につく概念は1つ以上必要です。'); teach = ask_concepts('読むと身につく概念')
    pre = []
    s = ask('先に読む本(題名の一部。なければ空欄)')
    if s:
        hits = find_books(s)
        if len(hits) == 1: pre = [hits[0]['id']]; print('  →', hits[0]['title'])
        else: print('  1冊に決まらなかったので、先に読む本は設定しません。あとで edit か GUI で。')
    with con:
        cur = con.execute('INSERT INTO book (title, short, category, author, publisher, year, title_basis, audience, stated_prerequisite, evidence, confidence, note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
                          (title, short, category, author or None, publisher or None, int(year) if year.isdigit() else None, basis, audience, stated, evidence, conf, note))
        for c in req: con.execute('INSERT INTO book_requires VALUES (?,?)', (cur.lastrowid, c))
        for c in teach: con.execute('INSERT INTO book_teaches VALUES (?,?)', (cur.lastrowid, c))
        for p in pre: con.execute('INSERT INTO book_prereq_book VALUES (?,?)', (cur.lastrowid, p))
    print(f'追加しました(番号 {cur.lastrowid})。反映するには: python3 manage.py build')

def cmd_edit(args):
    if len(args) < 3: print('使い方: edit 番号 項目 値\n項目:', ' '.join(EDITABLE)); return
    b = one_book(args[0]); col, val = args[1], ' '.join(args[2:])
    if col not in EDITABLE: print('直せる項目:', ' '.join(EDITABLE)); return
    if col in ('year', 'verified'): val = int(val)
    if val == '': val = None
    with con: con.execute(f'UPDATE book SET {col}=? WHERE id=?', (val, b['id']))
    print('直しました。反映するには: python3 manage.py build')

def cmd_delete(args):
    if not args: print('使い方: delete 番号'); return
    b = one_book(args[0])
    users = [r[0] for r in con.execute('SELECT b.title FROM book_prereq_book p JOIN book b ON b.id=p.book_id WHERE p.prereq_book_id=?', (b['id'],))]
    print(f"消す本: {b['id']} {b['title']}")
    if users: print('  この本を「先に読む本」にしている本があります(その設定も消えます):', '、'.join(users))
    if '--yes' not in args and input('本当に消しますか? (y/N): ').strip().lower() != 'y': print('やめました。'); return
    with con: con.execute('DELETE FROM book WHERE id=?', (b['id'],))
    print('消しました(前提・習得の記録も一緒に消えます)。反映するには: python3 manage.py build')

def run(*cmd):
    return subprocess.run([sys.executable, '-I', *cmd], cwd=HERE).returncode == 0

def cmd_check(_):
    bad = con.execute('PRAGMA foreign_key_check').fetchall()
    if bad: print('参照が壊れています:', [tuple(r) for r in bad]); sys.exit(1)
    if not run(HERE + 'build_data.py'): sys.exit(1)

def cmd_build(_):
    cmd_check(None)
    if not run(HERE + 'assemble.py'): sys.exit(1)
    print('index.html を作り直しました。GitHubに反映する: git add . → git commit -m "本を更新" → git push')

CMDS = {'list': cmd_list, 'show': cmd_show, 'concepts': cmd_concepts, 'add': cmd_add, 'edit': cmd_edit,
        'delete': cmd_delete, 'check': cmd_check, 'build': cmd_build}
if len(sys.argv) < 2 or sys.argv[1] not in CMDS: print(__doc__)
else: CMDS[sys.argv[1]](sys.argv[2:])

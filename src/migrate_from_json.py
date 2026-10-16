"""最初の1回だけ使う: 旧JSON(legacy_json/)から library.db を作る。
すでに library.db があるときは何もしない(上書きして追加したデータが消えるのを防ぐ)。"""
import json, os, re, sqlite3, sys
HERE = os.path.dirname(os.path.abspath(__file__)) + '/'
DB = HERE + 'library.db'
if os.path.exists(DB):
    print('library.db はすでにあります。作り直すときは、先にそのファイルを消してください。'); sys.exit(0)

# 旧 build_data.py にあった「背表紙の短い題名」。題名に含まれる文字列 → 短い題名
SHORT = [
    ("DeepLearning関連論文", "論文の読み方手引き(上)"), ("Kaggleに挑む", "Kaggleに挑む深層学習"),
    ("発展ディープラーニング", "発展ディープラーニング"), ("グラフニューラルネットワーク", "グラフニューラルネット"),
    ("ゼロから作るDeep Learning ―Python", "ゼロから作る① 理論と実装"), ("Deep Learning ❷", "ゼロから作る② 自然言語処理"),
    ("Deep Learning ❸", "ゼロから作る③ フレームワーク"), ("Deep Learning ❹", "ゼロから作る④ 強化学習"),
    ("Deep Learning ❺", "ゼロから作る⑤ 生成モデル"), ("Deep Learning ❻", "ゼロから作る⑥ LLM"),
    ("データ分析のための数理", "データ分析の数理モデル"), ("先輩データサイエンティスト", "先輩DSからの指南書"),
    ("高校数学の演習", "高校数学で学ぶ機械学習"), ("生成AI・ChatGPT", "ChatGPTでPython"),
    ("直感的に理解する", "Transformerの仕組み"), ("12歳からはじめる", "12歳からのPythonゲーム"),
    ("Chainerで", "Chainerで学ぶDL入門"), ("Excelでわかる", "ExcelでわかるDL超入門"),
    ("AutoML Vision", "AutoML Vision入門"), ("Minecraft", "MinecraftでPython"),
    ("Pythonスタートブック", "Pythonスタートブック"), ("Pythonチュートリアル", "Pythonチュートリアル"),
    ("Pythonによるはじめての", "はじめての機械学習"), ("Jupyter[実践]", "Jupyter[実践]入門"),
    ("PyTorchニューラルネットワーク", "PyTorch実装ハンドブック"), ("Raspberry Pi", "Raspberry Pi機械学習"),
    ("Unityではじめる機械学習", "Unity機械学習・強化学習"), ("Unityの教科書", "Unityの教科書"),
    ("ゼロからつくるPython", "ゼロからつくる機械学習"), ("たのしいプログラミング", "たのしいプログラミング"),
    ("データサイエンティストのためのデータベース", "DS向けデータベース基礎"), ("いちばんやさしい", "やさしいDL入門教室"),
    ("確かな力が身につく", "Python「超」入門"), ("逆引き大全", "Unity逆引き大全"), ("Processing", "Processing入門"),
    ("Unity VRアプリ", "UnityVRアプリ開発入門"), ("図解入門", "機械学習の基本と仕組み"), ("退屈なことは", "退屈なことはPython"),
]
def short_of(t):
    for k, s in SHORT:
        if k in t: return s
    return t

cm = json.load(open(HERE + 'legacy_json/concept_map_draft.json', encoding='utf-8'))
bk = json.load(open(HERE + 'legacy_json/books_draft.json', encoding='utf-8'))
con = sqlite3.connect(DB)
con.executescript(open(HERE + 'schema.sql', encoding='utf-8').read())
con.execute('PRAGMA foreign_keys = ON')
cat = {c['id']: c['category'] for c in cm['concepts']}
for c in cm['concepts']:
    con.execute('INSERT INTO concept VALUES (?,?,?)', (c['id'], c['name'], c['category']))
for c in cm['concepts']:
    for r in c['requires']:
        con.execute('INSERT INTO concept_requires VALUES (?,?)', (c['id'], r))
for c in cm['courses']:
    cur = con.execute('INSERT INTO course (name, code, year) VALUES (?,?,?)', (c['name'], c.get('code'), c['year']))
    for t in c['teaches']:
        con.execute('INSERT OR IGNORE INTO course_teaches VALUES (?,?)', (cur.lastrowid, t))
for e in cm['excluded_courses']:
    con.execute('INSERT INTO excluded_course VALUES (?,?,?)', (e['name'], e.get('code'), e.get('reason')))
ids = {}
for b in bk['books']:
    cur = con.execute(
        'INSERT INTO book (title, short, category, author, publisher, year, title_basis, audience, stated_prerequisite, evidence, confidence, note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        (b['title'], short_of(b['title']), b.get('category') or cat[b['teaches'][0]], b.get('author'), b.get('publisher'), b.get('year'),
         b.get('title_basis', ''), b['audience'], b['stated_prerequisite'], b['evidence'], b['confidence'], b['note']))
    ids[b['title']] = cur.lastrowid
for b in bk['books']:
    i = ids[b['title']]
    for t in dict.fromkeys(b['requires']): con.execute('INSERT INTO book_requires VALUES (?,?)', (i, t))
    for t in dict.fromkeys(b['teaches']): con.execute('INSERT INTO book_teaches VALUES (?,?)', (i, t))
    for t in b.get('book_requires', []): con.execute('INSERT INTO book_prereq_book VALUES (?,?)', (i, ids[t]))
con.commit(); con.close()
print('library.db を作りました')

-- レベル合わせるぞい: データベースの設計(SQLite)
-- 概念・授業・本を別々の表に分け、「本が前提とする概念」などの多対多は中間表で持つ。
-- 親を消すと子も消える(ON DELETE CASCADE)ので、本や授業は1行消すだけで関連も片づく。

CREATE TABLE concept (
  id        TEXT PRIMARY KEY,                -- 例: py_basic
  name      TEXT NOT NULL UNIQUE,            -- 例: Python基礎文法
  category  TEXT NOT NULL
);

-- 概念の前提(例: 回帰分析 は 相関 を前提とする)
CREATE TABLE concept_requires (
  concept_id  TEXT NOT NULL REFERENCES concept(id) ON DELETE CASCADE,
  requires_id TEXT NOT NULL REFERENCES concept(id) ON DELETE RESTRICT,
  PRIMARY KEY (concept_id, requires_id),
  CHECK (concept_id <> requires_id)
);

CREATE TABLE course (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT NOT NULL UNIQUE,
  code  TEXT,                                -- 例: SIC 101
  year  INTEGER NOT NULL CHECK (year BETWEEN 1 AND 4)
);

CREATE TABLE course_teaches (
  course_id  INTEGER NOT NULL REFERENCES course(id) ON DELETE CASCADE,
  concept_id TEXT    NOT NULL REFERENCES concept(id) ON DELETE CASCADE,
  PRIMARY KEY (course_id, concept_id)
);

-- 判定に使わない授業(理由つき)
CREATE TABLE excluded_course (
  name   TEXT PRIMARY KEY,
  code   TEXT,
  reason TEXT
);

CREATE TABLE book (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  title               TEXT NOT NULL UNIQUE,
  short               TEXT NOT NULL CHECK (length(short) <= 16),   -- 背表紙に縦書きする短い題名
  category            TEXT NOT NULL,
  author              TEXT,
  publisher           TEXT,
  year                INTEGER,
  title_basis         TEXT NOT NULL DEFAULT '',                    -- 題名をどう特定したか
  audience            TEXT NOT NULL DEFAULT '',
  stated_prerequisite TEXT NOT NULL DEFAULT '',
  evidence            TEXT NOT NULL DEFAULT '',
  confidence          TEXT NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high', 'medium', 'low')),
  note                TEXT NOT NULL DEFAULT '',
  verified            INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1))
);

CREATE TABLE book_requires (          -- 読む前に必要な概念
  book_id    INTEGER NOT NULL REFERENCES book(id) ON DELETE CASCADE,
  concept_id TEXT    NOT NULL REFERENCES concept(id) ON DELETE RESTRICT,
  PRIMARY KEY (book_id, concept_id)
);

CREATE TABLE book_teaches (           -- 読むと身につく概念
  book_id    INTEGER NOT NULL REFERENCES book(id) ON DELETE CASCADE,
  concept_id TEXT    NOT NULL REFERENCES concept(id) ON DELETE RESTRICT,
  PRIMARY KEY (book_id, concept_id)
);

CREATE TABLE book_prereq_book (       -- 先に読む本(上巻→下巻など)
  book_id        INTEGER NOT NULL REFERENCES book(id) ON DELETE CASCADE,
  prereq_book_id INTEGER NOT NULL REFERENCES book(id) ON DELETE CASCADE,
  PRIMARY KEY (book_id, prereq_book_id),
  CHECK (book_id <> prereq_book_id)
);

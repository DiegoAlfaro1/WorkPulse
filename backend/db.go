package main

import (
	"database/sql"

	_ "modernc.org/sqlite" // pure Go driver: no CGO, works in the static image
)

// WAL lets reads run alongside a write; busy_timeout waits on locks instead of
// failing; _txlock=immediate takes the write lock at BEGIN to avoid SQLITE_BUSY
// on lock upgrade. foreign_keys is off by default in SQLite.
const pragmas = "?_txlock=immediate" +
	"&_pragma=journal_mode(WAL)" +
	"&_pragma=busy_timeout(5000)" +
	"&_pragma=foreign_keys(1)" +
	"&_pragma=synchronous(NORMAL)"

func openDB(path string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", "file:"+path+pragmas)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, err
	}
	if _, err := db.Exec(schema); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

// ponytail: CREATE IF NOT EXISTS only; add a versioned migration list once a table needs ALTER.
// NOCASE so "Acme" and "acme" count as the same project/tag.
const schema = `
CREATE TABLE IF NOT EXISTS projects (
	id       INTEGER PRIMARY KEY,
	name     TEXT    NOT NULL COLLATE NOCASE,
	client   TEXT    NOT NULL DEFAULT '' COLLATE NOCASE,
	billable INTEGER NOT NULL DEFAULT 1,
	UNIQUE (name, client)
);
CREATE TABLE IF NOT EXISTS tags (
	id   INTEGER PRIMARY KEY,
	name TEXT NOT NULL UNIQUE COLLATE NOCASE
);`

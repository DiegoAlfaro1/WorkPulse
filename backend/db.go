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
	return db, nil
}

package main

import (
	"github.com/glebarez/sqlite" // pure Go GORM driver (modernc fork): no CGO, works in the static image
	"gorm.io/gorm"
)

// WAL lets reads run alongside a write; busy_timeout waits on locks instead of
// failing; _txlock=immediate takes the write lock at BEGIN to avoid SQLITE_BUSY
// on lock upgrade. foreign_keys is off by default in SQLite.
const pragmas = "?_txlock=immediate" +
	"&_pragma=journal_mode(WAL)" +
	"&_pragma=busy_timeout(5000)" +
	"&_pragma=foreign_keys(1)" +
	"&_pragma=synchronous(NORMAL)"

// openDB connects and brings the schema up to date with the models.
// TranslateError turns constraint violations into gorm.ErrDuplicatedKey / gorm.ErrForeignKeyViolated.
func openDB(path string) (*gorm.DB, error) {
	db, err := gorm.Open(sqlite.Open("file:"+path+pragmas), &gorm.Config{TranslateError: true})
	if err != nil {
		return nil, err
	}
	// ponytail: AutoMigrate only adds tables/columns/indexes; use versioned migrations once a column needs renaming or dropping.
	if err := db.AutoMigrate(&Project{}, &Tag{}, &Entry{}); err != nil {
		if sqlDB, _ := db.DB(); sqlDB != nil {
			sqlDB.Close()
		}
		return nil, err
	}
	return db, nil
}

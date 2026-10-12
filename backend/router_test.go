package main

import (
	"database/sql"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// testDB opens a fresh migrated database; the *sql.DB is for raw checks and closing.
func testDB(t *testing.T) (*gorm.DB, *sql.DB) {
	db, err := openDB(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { sqlDB.Close() })
	return db, sqlDB
}

func TestOpenDBPragmas(t *testing.T) {
	_, db := testDB(t)

	var mode string
	var fk int
	db.QueryRow("PRAGMA journal_mode").Scan(&mode)
	db.QueryRow("PRAGMA foreign_keys").Scan(&fk)
	if mode != "wal" || fk != 1 {
		t.Fatalf("journal_mode=%q foreign_keys=%d", mode, fk)
	}
}

// A restart re-runs AutoMigrate on an existing file; it must be a no-op, not a failed table rebuild.
func TestReopenDB(t *testing.T) {
	path := filepath.Join(t.TempDir(), "test.db")
	for i := 0; i < 2; i++ {
		db, err := openDB(path)
		if err != nil {
			t.Fatalf("open #%d: %v", i+1, err)
		}
		sqlDB, _ := db.DB()
		sqlDB.Close()
	}
}

func TestHealth(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, sqlDB := testDB(t)
	r := newRouter(db)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/health", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("got %d %s", w.Code, w.Body.String())
	}

	sqlDB.Close()
	w = httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/health", nil))
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("closed db: got %d", w.Code)
	}
}

type apiCase struct {
	method, path, body string
	code               int
	resp               string // checked only when non-empty
}

// runCases plays the requests in order against one fresh database.
func runCases(t *testing.T, cases []apiCase) {
	gin.SetMode(gin.TestMode)
	db, _ := testDB(t)
	r := newRouter(db)
	for _, tc := range cases {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body)))
		if resp := strings.TrimSpace(w.Body.String()); w.Code != tc.code || (tc.resp != "" && resp != tc.resp) {
			t.Errorf("%s %s %s: got %d %s", tc.method, tc.path, tc.body, w.Code, resp)
		}
	}
}

func TestCatalog(t *testing.T) {
	runCases(t, []apiCase{
		{"GET", "/api/projects", "", 200, `[]`},
		{"POST", "/api/projects", `{"name":" Website ","client":"Acme","billable":true}`, 201, `{"id":1,"name":"Website","client":"Acme","billable":true}`},
		{"POST", "/api/projects", `{"name":"website","client":"ACME"}`, 409, ``},
		{"POST", "/api/projects", `{"name":"Website","client":"Other"}`, 201, ``},
		{"POST", "/api/projects", `{"name":"  "}`, 400, ``},
		{"POST", "/api/projects", `not json`, 400, ``},
		{"GET", "/api/projects", "", 200, `[{"id":1,"name":"Website","client":"Acme","billable":true},{"id":2,"name":"Website","client":"Other","billable":false}]`},
		{"POST", "/api/tags", `{"name":"#deep-work"}`, 201, `{"id":1,"name":"deep-work"}`},
		{"POST", "/api/tags", `{"name":"Deep-Work"}`, 409, ``},
		{"POST", "/api/tags", `{"name":"two words"}`, 400, ``},
		{"POST", "/api/tags", `{"name":"bugfix"}`, 201, ``},
		{"GET", "/api/tags", "", 200, `[{"id":2,"name":"bugfix"},{"id":1,"name":"deep-work"}]`},
	})
}

func TestEntries(t *testing.T) {
	const ok = `{"member":"m0","project":1,"task":"Design","desc":" Mockups ","tags":[{"name":"Deep-Work"}],"billable":true,"start":1000,"end":5000}`
	runCases(t, []apiCase{
		{"POST", "/api/projects", `{"name":"Website","client":"Acme"}`, 201, ``},
		{"POST", "/api/tags", `{"name":"deep-work"}`, 201, ``},
		{"GET", "/api/entries", "", 200, `[]`},
		{"POST", "/api/entries", ok, 201, `{"id":1,"member":"m0","project":1,"task":"Design","desc":"Mockups","tags":[{"id":1,"name":"deep-work"}],"billable":true,"start":1000,"end":5000}`},
		{"POST", "/api/entries", `{"member":"m0","project":1,"task":"Admin","start":6000,"end":7000}`, 201, ``},
		{"POST", "/api/entries", strings.Replace(ok, `"end":5000`, `"end":1000`, 1), 400, ``},
		{"POST", "/api/entries", strings.Replace(ok, `"project":1`, `"project":9`, 1), 400, `{"error":"unknown project"}`},
		{"POST", "/api/entries", strings.Replace(ok, `Deep-Work`, `nope`, 1), 400, `{"error":"unknown tag: nope"}`},
		{"POST", "/api/entries", strings.Replace(ok, `"task":"Design",`, ``, 1), 400, ``},
		{"GET", "/api/entries", "", 200, `[{"id":2,"member":"m0","project":1,"task":"Admin","desc":"","tags":[],"billable":false,"start":6000,"end":7000},` +
			`{"id":1,"member":"m0","project":1,"task":"Design","desc":"Mockups","tags":[{"id":1,"name":"deep-work"}],"billable":true,"start":1000,"end":5000}]`},
		{"DELETE", "/api/entries/1", "", 204, ``},
		{"DELETE", "/api/entries/1", "", 404, `{"error":"not found"}`},
		{"DELETE", "/api/entries/abc", "", 400, ``},
		{"GET", "/api/entries", "", 200, `[{"id":2,"member":"m0","project":1,"task":"Admin","desc":"","tags":[],"billable":false,"start":6000,"end":7000}]`},
	})
}

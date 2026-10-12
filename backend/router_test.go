package main

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestOpenDBPragmas(t *testing.T) {
	db, err := openDB(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	var mode string
	var fk int
	db.QueryRow("PRAGMA journal_mode").Scan(&mode)
	db.QueryRow("PRAGMA foreign_keys").Scan(&fk)
	if mode != "wal" || fk != 1 {
		t.Fatalf("journal_mode=%q foreign_keys=%d", mode, fk)
	}
}

func TestHealth(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := openDB(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	r := newRouter(db)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/health", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("got %d %s", w.Code, w.Body.String())
	}

	db.Close()
	w = httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/health", nil))
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("closed db: got %d", w.Code)
	}
}

func TestCatalog(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := openDB(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	r := newRouter(db)
	do := func(method, path, body string) (int, string) {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(method, path, strings.NewReader(body)))
		return w.Code, strings.TrimSpace(w.Body.String())
	}

	cases := []struct {
		method, path, body string
		code               int
		resp               string
	}{
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
	}
	for _, tc := range cases {
		code, resp := do(tc.method, tc.path, tc.body)
		if code != tc.code || (tc.resp != "" && resp != tc.resp) {
			t.Errorf("%s %s %s: got %d %s", tc.method, tc.path, tc.body, code, resp)
		}
	}
}

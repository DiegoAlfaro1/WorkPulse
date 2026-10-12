package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
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
	as, method, path, body string // as: fixture user whose token is sent ("" = none)
	code                   int
	resp                   string // checked only when non-empty
}

// testAPI is a router over a fresh database seeded with this fixture (ids in brackets):
//
//	companies: Acme [1], Globex [2]      teams: Acme/Design [1], Acme/Engineering [2], Globex/Ops [3]
//	users: super [1] superadmin · admin [2] Acme admin · mgr [3] manager of Design · dana [4] Design
//	       eli [5] Engineering · gina [6] Globex admin · sam [7] Design + Engineering
//
// Every user has password "password123", email <name>@test.io, and a session in tokens.
type testAPI struct {
	t      *testing.T
	db     *gorm.DB
	r      *gin.Engine
	tokens map[string]string
}

func newTestAPI(t *testing.T) *testAPI {
	gin.SetMode(gin.TestMode)
	db, _ := testDB(t)
	a := &testAPI{t: t, db: db, r: newRouter(db), tokens: map[string]string{}}
	must := func(err error) {
		if err != nil {
			t.Fatal(err)
		}
	}
	hash, err := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.MinCost)
	must(err)
	acme, globex := Company{Name: "Acme"}, Company{Name: "Globex"}
	must(db.Create(&acme).Error)
	must(db.Create(&globex).Error)
	design, eng, ops := Team{CompanyID: acme.ID, Name: "Design"}, Team{CompanyID: acme.ID, Name: "Engineering"}, Team{CompanyID: globex.ID, Name: "Ops"}
	for _, tm := range []*Team{&design, &eng, &ops} {
		must(db.Omit("Company").Create(tm).Error)
	}
	for _, u := range []struct {
		name, role string
		company    *uint
		teams      []Team
	}{
		{"super", RoleSuperAdmin, nil, nil},
		{"admin", RoleAdmin, &acme.ID, nil},
		{"mgr", RoleManager, &acme.ID, []Team{design}},
		{"dana", RoleEmployee, &acme.ID, []Team{design}},
		{"eli", RoleEmployee, &acme.ID, []Team{eng}},
		{"gina", RoleAdmin, &globex.ID, nil},
		{"sam", RoleEmployee, &acme.ID, []Team{design, eng}},
	} {
		m := User{CompanyID: u.company, Name: u.name, Email: u.name + "@test.io", PasswordHash: hash, Role: u.role, Teams: u.teams}
		must(db.Omit("Company", "Teams.*").Create(&m).Error)
		tok, _, err := newSession(db, m.ID, nil)
		must(err)
		a.tokens[u.name] = tok
	}
	return a
}

func (a *testAPI) do(as, method, path, body string) (int, string) {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if as != "" {
		req.Header.Set("Authorization", "Bearer "+a.tokens[as])
	}
	w := httptest.NewRecorder()
	a.r.ServeHTTP(w, req)
	return w.Code, strings.TrimSpace(w.Body.String())
}

// run plays the requests in order.
func (a *testAPI) run(cases []apiCase) {
	a.t.Helper()
	for _, tc := range cases {
		code, resp := a.do(tc.as, tc.method, tc.path, tc.body)
		if code != tc.code || (tc.resp != "" && resp != tc.resp) {
			a.t.Errorf("[%s] %s %s %s: got %d %s", tc.as, tc.method, tc.path, tc.body, code, resp)
		}
	}
}

// names returns the "name" fields of a JSON array response, comma-joined.
func (a *testAPI) names(as, path string) string {
	a.t.Helper()
	code, resp := a.do(as, "GET", path, "")
	var rows []struct{ Name string }
	if err := json.Unmarshal([]byte(resp), &rows); code != 200 || err != nil {
		a.t.Fatalf("[%s] GET %s: %d %s", as, path, code, resp)
	}
	out := make([]string, len(rows))
	for i, r := range rows {
		out[i] = r.Name
	}
	return strings.Join(out, ",")
}

// login signs in through the API and stores the token under name.
func (a *testAPI) login(name, email, password string) {
	a.t.Helper()
	code, resp := a.do("", "POST", "/api/auth/login", `{"email":"`+email+`","password":"`+password+`"}`)
	var out struct{ Token string }
	if err := json.Unmarshal([]byte(resp), &out); code != 200 || err != nil || out.Token == "" {
		a.t.Fatalf("login %s: %d %s", email, code, resp)
	}
	a.tokens[name] = out.Token
}

func TestAuth(t *testing.T) {
	a := newTestAPI(t)
	a.run([]apiCase{
		{"", "POST", "/api/auth/login", `{"email":"dana@test.io","password":"wrong-password"}`, 401, `{"error":"wrong email or password"}`},
		{"", "POST", "/api/auth/login", `{"email":"nobody@test.io","password":"password123"}`, 401, `{"error":"wrong email or password"}`},
		{"", "POST", "/api/auth/login", `{"email":"dana@test.io"}`, 400, ``},
		{"", "GET", "/api/auth/me", "", 401, ``},
		{"", "GET", "/api/projects", "", 401, ``},
	})
	a.login("dana2", " DANA@test.io ", "password123") // email is trimmed and case-insensitive
	a.run([]apiCase{
		{"dana2", "GET", "/api/auth/me", "", 200, `{"impersonating":false,"user":{"id":4,"company":1,"name":"dana","email":"dana@test.io","role":"employee","teams":[{"id":1,"name":"Design"}],"active":true}}`},
		{"dana2", "POST", "/api/auth/logout", "", 204, ``},
		{"dana2", "GET", "/api/auth/me", "", 401, ``},
		{"dana", "GET", "/api/auth/me", "", 200, ``}, // other sessions survive a logout

		{"eli", "POST", "/api/auth/password", `{"current":"wrong-password","new":"brand-new-pass"}`, 403, ``},
		{"eli", "POST", "/api/auth/password", `{"current":"password123","new":"short"}`, 400, ``},
	})
	a.login("eli2", "eli@test.io", "password123")
	a.run([]apiCase{
		{"eli", "POST", "/api/auth/password", `{"current":"password123","new":"brand-new-pass"}`, 204, ``},
		{"eli", "GET", "/api/auth/me", "", 200, ``},  // the session that changed it stays
		{"eli2", "GET", "/api/auth/me", "", 401, ``}, // every other one is revoked
		{"", "POST", "/api/auth/login", `{"email":"eli@test.io","password":"password123"}`, 401, ``},
	})
	a.login("eli3", "eli@test.io", "brand-new-pass")
}

func TestSeedSuperAdmin(t *testing.T) {
	db, _ := testDB(t)
	if err := seedSuperAdmin(db, "", ""); err == nil {
		t.Fatal("no env on an empty db: want an error")
	}
	if err := seedSuperAdmin(db, "root@test.io", "short"); err == nil {
		t.Fatal("short password: want an error")
	}
	if err := seedSuperAdmin(db, "root@test.io", "password123"); err != nil {
		t.Fatal(err)
	}
	if err := seedSuperAdmin(db, "", ""); err != nil { // already there: no-op, env not needed
		t.Fatal(err)
	}
	var n int64
	db.Model(&User{}).Where("role = ?", RoleSuperAdmin).Count(&n)
	if n != 1 {
		t.Fatalf("got %d super admins", n)
	}
}

func TestImpersonate(t *testing.T) {
	a := newTestAPI(t)
	a.run([]apiCase{
		{"admin", "POST", "/api/auth/impersonate", `{"user":4}`, 403, ``},
		{"super", "POST", "/api/auth/impersonate", `{"user":1}`, 404, ``},
		{"super", "GET", "/api/projects", "", 403, ``}, // no company of their own
	})
	code, resp := a.do("super", "POST", "/api/auth/impersonate", `{"user":4}`)
	var out struct{ Token string }
	if json.Unmarshal([]byte(resp), &out); code != 200 || out.Token == "" {
		t.Fatalf("impersonate: %d %s", code, resp)
	}
	a.tokens["as-dana"] = out.Token
	a.run([]apiCase{
		{"as-dana", "GET", "/api/auth/me", "", 200, `{"impersonating":true,"user":{"id":4,"company":1,"name":"dana","email":"dana@test.io","role":"employee","teams":[{"id":1,"name":"Design"}],"active":true}}`},
		{"as-dana", "GET", "/api/projects", "", 200, `[]`},
		{"as-dana", "POST", "/api/projects", `{"name":"Website","client":"Acme"}`, 201, ``},
		{"as-dana", "POST", "/api/entries", `{"project":1,"task":"Design","desc":"Fix","start":1000,"end":5000}`, 201, ``},
	})

	// Short-lived session, an audit row, and the entry is flagged with who really created it.
	var s Session
	a.db.Where("token_hash = ?", hashToken(out.Token)).First(&s)
	if s.ExpiresAt > time.Now().Add(impersonationTTL).UnixMilli() {
		t.Errorf("impersonation session expires at %d, want within %v", s.ExpiresAt, impersonationTTL)
	}
	var logs []ImpersonationLog
	a.db.Find(&logs)
	if len(logs) != 1 || logs[0].SuperAdminID != 1 || logs[0].UserID != 4 {
		t.Errorf("impersonation log: %+v", logs)
	}
	var e Entry
	a.db.First(&e)
	if e.UserID != 4 || e.ImpersonatorID == nil || *e.ImpersonatorID != 1 {
		t.Errorf("entry: member %d impersonator %v", e.UserID, e.ImpersonatorID)
	}
}

func TestCompanies(t *testing.T) {
	a := newTestAPI(t)
	a.run([]apiCase{
		{"admin", "GET", "/api/companies", "", 403, ``},
		{"super", "GET", "/api/companies", "", 200, `[{"id":1,"name":"Acme","active":true},{"id":2,"name":"Globex","active":true}]`},
		{"super", "POST", "/api/companies", `{"name":"Initech","admin":{"name":"Ian","email":"ian@initech.io","password":"password123"}}`, 201, `{"id":3,"name":"Initech","active":true}`},
		{"super", "POST", "/api/companies", `{"name":"initech","admin":{"name":"X","email":"x@initech.io","password":"password123"}}`, 409, ``},
		{"super", "POST", "/api/companies", `{"name":"Hooli","admin":{"name":"X","email":"not-an-email","password":"password123"}}`, 400, ``},
		// The admin's email is taken: the company must not be created either.
		{"super", "POST", "/api/companies", `{"name":"Hooli","admin":{"name":"X","email":"dana@test.io","password":"password123"}}`, 409, ``},
	})
	if got := a.names("super", "/api/companies"); got != "Acme,Globex,Initech" {
		t.Fatalf("companies: %s", got)
	}
	a.login("ian", "ian@initech.io", "password123")
	a.run([]apiCase{
		{"ian", "GET", "/api/auth/me", "", 200, `{"impersonating":false,"user":{"id":8,"company":3,"name":"Ian","email":"ian@initech.io","role":"admin","teams":[],"active":true}}`},
	})
}

func TestListUsers(t *testing.T) {
	a := newTestAPI(t)
	for as, want := range map[string]string{
		"dana":  "dana",
		"mgr":   "dana,mgr,sam",
		"admin": "admin,dana,eli,mgr,sam",
		"gina":  "gina",
		"super": "admin,dana,eli,gina,mgr,sam", // the super admin never lists themself
	} {
		if got := a.names(as, "/api/users"); got != want {
			t.Errorf("%s sees %s, want %s", as, got, want)
		}
	}
	a.run([]apiCase{
		{"dana", "GET", "/api/users", "", 200, `[{"id":4,"company":1,"name":"dana","email":"dana@test.io","role":"employee","teams":[{"id":1,"name":"Design"}],"active":true}]`},
	})
}

func TestCreateUser(t *testing.T) {
	a := newTestAPI(t)
	emp := func(email, role, teams string) string {
		return `{"name":"New","email":"` + email + `","password":"password123","role":"` + role + `","teams":` + teams + `}`
	}
	a.run([]apiCase{
		{"dana", "POST", "/api/users", emp("a@test.io", "employee", "[1]"), 403, ``},
		{"super", "POST", "/api/users", emp("a@test.io", "employee", "[]"), 403, ``},
		{"mgr", "POST", "/api/users", emp("a@test.io", "employee", "[1]"), 201, `{"id":8,"company":1,"name":"New","email":"a@test.io","role":"employee","teams":[{"id":1,"name":"Design"}],"active":true}`},
		{"mgr", "POST", "/api/users", emp("b@test.io", "manager", "[1]"), 403, ``},
		{"mgr", "POST", "/api/users", emp("b@test.io", "employee", "[2]"), 403, ``},
		{"mgr", "POST", "/api/users", emp("b@test.io", "employee", "[]"), 403, ``},
		{"admin", "POST", "/api/users", emp("b@test.io", "manager", "[2,2]"), 201, `{"id":9,"company":1,"name":"New","email":"b@test.io","role":"manager","teams":[{"id":2,"name":"Engineering"}],"active":true}`},
		{"admin", "POST", "/api/users", emp("c@test.io", "employee", "[3]"), 400, `{"error":"unknown team"}`},
		{"admin", "POST", "/api/users", emp("DANA@test.io", "employee", "[]"), 409, ``},
		{"admin", "POST", "/api/users", emp("c@test.io", "superadmin", "[]"), 400, ``},
		{"admin", "POST", "/api/users", strings.Replace(emp("c@test.io", "employee", "[]"), "password123", "short", 1), 400, ``},
		{"admin", "POST", "/api/users", strings.Replace(emp("c@test.io", "employee", "[]"), `"New"`, `"  "`, 1), 400, `{"error":"name is required"}`},
	})
	a.login("new", "a@test.io", "password123")
}

func TestUpdateUser(t *testing.T) {
	a := newTestAPI(t)
	a.run([]apiCase{
		{"dana", "PATCH", "/api/users/4", `{"name":"Dana"}`, 403, ``},
		{"mgr", "PATCH", "/api/users/4", `{"name":"Dana"}`, 403, ``},
		{"mgr", "PATCH", "/api/users/4", `{"teams":[2]}`, 403, ``},
		{"mgr", "PATCH", "/api/users/5", `{"teams":[1]}`, 404, ``}, // eli isn't in mgr's teams
		{"mgr", "PATCH", "/api/users/3", `{"teams":[]}`, 403, ``},  // only employees
		// sam is in Design + Engineering: mgr can only take away Design; Engineering stays.
		{"mgr", "PATCH", "/api/users/7", `{"teams":[]}`, 200, `{"id":7,"company":1,"name":"sam","email":"sam@test.io","role":"employee","teams":[{"id":2,"name":"Engineering"}],"active":true}`},
		{"mgr", "PATCH", "/api/users/7", `{"teams":[1]}`, 404, ``}, // no longer visible to mgr

		{"admin", "PATCH", "/api/users/4", `{"name":" Dana ","role":"manager","teams":[1,2],"active":true}`, 200, `{"id":4,"company":1,"name":"Dana","email":"dana@test.io","role":"manager","teams":[{"id":1,"name":"Design"},{"id":2,"name":"Engineering"}],"active":true}`},
		{"admin", "PATCH", "/api/users/4", `{"teams":[3]}`, 400, ``},
		{"admin", "PATCH", "/api/users/4", `{"name":""}`, 400, ``},
		{"admin", "PATCH", "/api/users/2", `{"role":"employee"}`, 403, ``},
		{"admin", "PATCH", "/api/users/2", `{"role":"admin","name":"Boss"}`, 200, ``}, // same role is fine
		{"admin", "PATCH", "/api/users/6", `{"name":"x"}`, 404, ``},                   // other company
		{"admin", "PATCH", "/api/users/1", `{"name":"x"}`, 404, ``},                   // the super admin
		{"admin", "PATCH", "/api/users/abc", `{}`, 400, ``},
		{"admin", "PATCH", "/api/users/5", `{"password":"short"}`, 400, ``},
		{"admin", "PATCH", "/api/users/5", `{"password":"reset-password"}`, 200, ``},
		{"eli", "GET", "/api/auth/me", "", 401, ``}, // a reset signs the user out
	})
	a.login("eli2", "eli@test.io", "reset-password")
}

func TestDeactivateUser(t *testing.T) {
	a := newTestAPI(t)
	a.run([]apiCase{
		{"admin", "POST", "/api/projects", `{"name":"Website","client":"Acme"}`, 201, ``},
		{"dana", "POST", "/api/entries", `{"project":1,"task":"Design","desc":"Mockups","tags":[],"start":1000,"end":5000}`, 201, ``},
		{"dana", "POST", "/api/users/5/deactivate", "", 403, ``},
		{"mgr", "POST", "/api/users/7/deactivate", "", 403, ``}, // sam is also in Engineering
		{"mgr", "POST", "/api/users/5/deactivate", "", 404, ``},
		{"mgr", "POST", "/api/users/3/deactivate", "", 403, ``}, // themself
		{"mgr", "POST", "/api/users/4/deactivate", "", 200, `{"id":4,"company":1,"name":"dana","email":"dana@test.io","role":"employee","teams":[{"id":1,"name":"Design"}],"active":false}`},
		{"dana", "GET", "/api/auth/me", "", 401, ``}, // signed out everywhere
		{"", "POST", "/api/auth/login", `{"email":"dana@test.io","password":"password123"}`, 403, `{"error":"this account is deactivated"}`},
		{"", "POST", "/api/auth/login", `{"email":"dana@test.io","password":"wrong-password"}`, 401, ``}, // no hint without the password
		{"super", "POST", "/api/auth/impersonate", `{"user":4}`, 403, ``},
		// Nothing is lost: the entry is still reported and dana is still listed.
		{"admin", "GET", "/api/entries", "", 200, `[{"id":1,"member":4,"project":1,"task":"Design","desc":"Mockups","tags":[],"billable":false,"start":1000,"end":5000}]`},
		{"admin", "POST", "/api/users/2/deactivate", "", 403, ``},
		{"admin", "POST", "/api/users/6/deactivate", "", 404, ``},
		{"admin", "POST", "/api/users/1/deactivate", "", 404, ``},
		{"mgr", "POST", "/api/users/4/activate", "", 200, ``},
	})
	if got := a.names("admin", "/api/users"); got != "admin,dana,eli,mgr,sam" {
		t.Fatalf("listed: %s", got)
	}
	a.login("dana2", "dana@test.io", "password123")
}

func TestDeactivateCompany(t *testing.T) {
	a := newTestAPI(t)
	a.run([]apiCase{
		{"admin", "POST", "/api/companies/1/deactivate", "", 403, ``},
		{"super", "POST", "/api/companies/9/deactivate", "", 404, ``},
		{"super", "POST", "/api/companies/1/deactivate", "", 200, `{"id":1,"name":"Acme","active":false}`},
		{"admin", "GET", "/api/auth/me", "", 401, ``},
		{"dana", "GET", "/api/auth/me", "", 401, ``},
		{"", "POST", "/api/auth/login", `{"email":"dana@test.io","password":"password123"}`, 403, `{"error":"this account is deactivated"}`},
		{"super", "POST", "/api/auth/impersonate", `{"user":4}`, 403, ``},
		{"gina", "GET", "/api/auth/me", "", 200, ``}, // other companies are untouched
		{"super", "GET", "/api/companies", "", 200, `[{"id":1,"name":"Acme","active":false},{"id":2,"name":"Globex","active":true}]`},
		{"super", "POST", "/api/companies/1/activate", "", 200, `{"id":1,"name":"Acme","active":true}`},
	})
	a.login("dana2", "dana@test.io", "password123")
}

func TestTeams(t *testing.T) {
	a := newTestAPI(t)
	a.run([]apiCase{
		{"admin", "GET", "/api/teams", "", 200, `[{"id":1,"name":"Design"},{"id":2,"name":"Engineering"}]`},
		{"mgr", "GET", "/api/teams", "", 200, `[{"id":1,"name":"Design"}]`},
		{"eli", "GET", "/api/teams", "", 200, `[{"id":2,"name":"Engineering"}]`},
		{"super", "GET", "/api/teams", "", 403, ``},
		{"mgr", "POST", "/api/teams", `{"name":"Sales"}`, 403, ``},
		{"admin", "POST", "/api/teams", `{"name":" Sales "}`, 201, `{"id":4,"name":"Sales"}`},
		{"admin", "POST", "/api/teams", `{"name":"design"}`, 409, ``},
		{"admin", "POST", "/api/teams", `{"name":" "}`, 400, ``},
		{"gina", "POST", "/api/teams", `{"name":"Design"}`, 201, ``}, // names are per company
		{"gina", "DELETE", "/api/teams/1", "", 404, ``},
		{"mgr", "DELETE", "/api/teams/1", "", 403, ``},
		{"admin", "PATCH", "/api/teams/2", `{"name":" Platform "}`, 200, `{"id":2,"name":"Platform"}`},
		{"admin", "PATCH", "/api/teams/2", `{"name":"sales"}`, 409, ``},
		{"admin", "PATCH", "/api/teams/2", `{"name":""}`, 400, ``},
		{"admin", "PATCH", "/api/teams/9", `{"name":"X"}`, 404, ``},
		{"gina", "PATCH", "/api/teams/2", `{"name":"X"}`, 404, ``},
		{"mgr", "PATCH", "/api/teams/1", `{"name":"X"}`, 403, ``},
		{"eli", "GET", "/api/teams", "", 200, `[{"id":2,"name":"Platform"}]`},
		{"admin", "DELETE", "/api/teams/1", "", 204, ``},
		{"admin", "DELETE", "/api/teams/1", "", 404, ``},
		// Memberships go with the team; the users stay.
		{"mgr", "GET", "/api/teams", "", 200, `[]`},
		{"dana", "GET", "/api/users", "", 200, `[{"id":4,"company":1,"name":"dana","email":"dana@test.io","role":"employee","teams":[],"active":true}]`},
	})
	if got := a.names("mgr", "/api/users"); got != "mgr" {
		t.Fatalf("mgr sees %s after their team was deleted", got)
	}
}

func TestCatalog(t *testing.T) {
	a := newTestAPI(t)
	a.run([]apiCase{
		{"admin", "GET", "/api/projects", "", 200, `[]`},
		{"admin", "POST", "/api/projects", `{"name":" Website ","client":"Acme","billable":true}`, 201, `{"id":1,"name":"Website","client":"Acme","billable":true,"color":""}`},
		{"dana", "POST", "/api/projects", `{"name":"website","client":"ACME"}`, 409, ``}, // anyone can create; shared across teams
		{"eli", "POST", "/api/projects", `{"name":"Website","client":"Other"}`, 201, ``},
		{"admin", "POST", "/api/projects", `{"name":"  "}`, 400, ``},
		{"admin", "POST", "/api/projects", `{"name":"Red","color":"red"}`, 400, ``},
		{"admin", "POST", "/api/projects", `{"name":"Red","color":"#ec3013"}`, 201, `{"id":3,"name":"Red","client":"","billable":false,"color":"#ec3013"}`},
		{"admin", "POST", "/api/projects", `not json`, 400, ``},
		{"dana", "GET", "/api/projects", "", 200, `[{"id":1,"name":"Website","client":"Acme","billable":true,"color":""},{"id":2,"name":"Website","client":"Other","billable":false,"color":""},{"id":3,"name":"Red","client":"","billable":false,"color":"#ec3013"}]`},
		{"gina", "GET", "/api/projects", "", 200, `[]`}, // other company
		{"gina", "POST", "/api/projects", `{"name":"Website","client":"Acme"}`, 201, ``},
		{"admin", "POST", "/api/tags", `{"name":"#deep-work"}`, 201, `{"id":1,"name":"deep-work"}`},
		{"admin", "POST", "/api/tags", `{"name":"Deep-Work"}`, 409, ``},
		{"admin", "POST", "/api/tags", `{"name":"two words"}`, 400, ``},
		{"dana", "POST", "/api/tags", `{"name":"bugfix"}`, 201, ``},
		{"eli", "GET", "/api/tags", "", 200, `[{"id":2,"name":"bugfix"},{"id":1,"name":"deep-work"}]`},
		{"gina", "GET", "/api/tags", "", 200, `[]`},
		{"gina", "POST", "/api/tags", `{"name":"deep-work"}`, 201, ``},
	})
}

func TestEntries(t *testing.T) {
	a := newTestAPI(t)
	soon, later := strconv.FormatInt(time.Now().Add(time.Hour).UnixMilli(), 10), strconv.FormatInt(time.Now().Add(2*time.Hour).UnixMilli(), 10)
	const ok = `{"member":4,"project":1,"task":"Design","desc":" Mockups ","tags":[{"name":"Deep-Work"}],"billable":true,"start":1000,"end":5000}`
	a.run([]apiCase{
		{"admin", "POST", "/api/projects", `{"name":"Website","client":"Acme"}`, 201, ``},
		{"gina", "POST", "/api/projects", `{"name":"Globex site","client":"Globex"}`, 201, ``}, // id 2
		{"admin", "POST", "/api/tags", `{"name":"deep-work"}`, 201, ``},
		{"gina", "POST", "/api/tags", `{"name":"globex-only"}`, 201, ``},
		{"dana", "GET", "/api/entries", "", 200, `[]`},
		{"dana", "POST", "/api/entries", strings.Replace(ok, `"member":4`, `"member":99`, 1), 400, `{"error":"unknown member"}`},
		{"dana", "POST", "/api/entries", ok, 201, `{"id":1,"member":4,"project":1,"task":"Design","desc":"Mockups","tags":[{"id":1,"name":"deep-work"}],"billable":true,"start":1000,"end":5000}`},
		{"eli", "POST", "/api/entries", `{"project":1,"task":"Admin","desc":"Email","start":6000,"end":7000}`, 201, ``},
		{"dana", "POST", "/api/entries", strings.Replace(ok, `"end":5000`, `"end":1000`, 1), 400, `{"error":"end must be after start"}`},
		{"dana", "POST", "/api/entries", strings.Replace(ok, `"end":5000`, `"end":86401001`, 1), 400, `{"error":"an entry can't be longer than 24 hours"}`},
		{"dana", "POST", "/api/entries", strings.Replace(ok, `"start":1000,"end":5000`, `"start":`+soon+`,"end":`+later, 1), 400, `{"error":"an entry can't end in the future"}`},
		{"dana", "POST", "/api/entries", strings.Replace(ok, `"project":1`, `"project":9`, 1), 400, `{"error":"unknown project"}`},
		{"dana", "POST", "/api/entries", strings.Replace(ok, `"project":1`, `"project":2`, 1), 400, `{"error":"unknown project"}`}, // Globex's
		{"dana", "POST", "/api/entries", strings.Replace(ok, `Deep-Work`, `nope`, 1), 400, `{"error":"unknown tag: nope"}`},
		{"dana", "POST", "/api/entries", strings.Replace(ok, `Deep-Work`, `globex-only`, 1), 400, `{"error":"unknown tag: globex-only"}`},
		{"dana", "POST", "/api/entries", strings.Replace(ok, `"task":"Design",`, ``, 1), 400, `{"error":"task is required"}`},
		{"dana", "POST", "/api/entries", strings.Replace(ok, `" Mockups "`, `"  "`, 1), 400, `{"error":"description is required"}`},
		{"dana", "POST", "/api/entries", strings.Replace(ok, `"project":1,`, ``, 1), 400, ``},
		{"super", "POST", "/api/entries", ok, 403, ``},

		// Visibility: own entries; a manager adds their teams'; an admin sees the company.
		{"eli", "GET", "/api/entries", "", 200, `[{"id":2,"member":5,"project":1,"task":"Admin","desc":"Email","tags":[],"billable":false,"start":6000,"end":7000}]`},
		{"mgr", "GET", "/api/entries", "", 200, `[{"id":1,"member":4,"project":1,"task":"Design","desc":"Mockups","tags":[{"id":1,"name":"deep-work"}],"billable":true,"start":1000,"end":5000}]`},
		{"admin", "GET", "/api/entries", "", 200, `[{"id":2,"member":5,"project":1,"task":"Admin","desc":"Email","tags":[],"billable":false,"start":6000,"end":7000},` +
			`{"id":1,"member":4,"project":1,"task":"Design","desc":"Mockups","tags":[{"id":1,"name":"deep-work"}],"billable":true,"start":1000,"end":5000}]`},
		{"gina", "GET", "/api/entries", "", 200, `[]`},

		// Delete: own entries; admins anyone's in their company.
		{"mgr", "DELETE", "/api/entries/1", "", 404, ``},
		{"gina", "DELETE", "/api/entries/1", "", 404, ``},
		{"dana", "DELETE", "/api/entries/2", "", 404, ``},
		{"dana", "DELETE", "/api/entries/1", "", 204, ``},
		{"dana", "DELETE", "/api/entries/1", "", 404, `{"error":"not found"}`},
		{"dana", "DELETE", "/api/entries/abc", "", 400, ``},
		{"admin", "DELETE", "/api/entries/2", "", 204, ``},
		{"admin", "GET", "/api/entries", "", 200, `[]`},
	})
}

func TestEditEntries(t *testing.T) {
	a := newTestAPI(t)
	const e = `{"project":1,"task":"Design","desc":"Mockups","tags":[{"name":"deep-work"}],"start":1000,"end":5000}`
	at := func(start, end string) string {
		return strings.Replace(e, `"start":1000,"end":5000`, `"start":`+start+`,"end":`+end, 1)
	}
	forMember := func(id, start, end string) string {
		return strings.Replace(at(start, end), `{`, `{"member":`+id+`,`, 1)
	}
	a.run([]apiCase{
		{"admin", "POST", "/api/projects", `{"name":"Website","client":"Acme"}`, 201, ``},
		{"admin", "POST", "/api/tags", `{"name":"deep-work"}`, 201, ``},
		{"dana", "POST", "/api/entries", e, 201, ``}, // 1
		// Overlaps are rejected for the same member only; touching ends are fine.
		{"dana", "POST", "/api/entries", at("4000", "6000"), 409, `{"error":"overlaps another entry"}`},
		{"dana", "POST", "/api/entries", at("2000", "3000"), 409, ``},
		{"dana", "POST", "/api/entries", at("5000", "6000"), 201, ``}, // 2
		{"eli", "POST", "/api/entries", e, 201, ``},                   // 3

		// Time for others: anyone the caller can see (dana is in mgr's team, eli isn't).
		{"mgr", "POST", "/api/entries", forMember("4", "7000", "8000"), 201, `{"id":4,"member":4,"project":1,"task":"Design","desc":"Mockups","tags":[{"id":1,"name":"deep-work"}],"billable":false,"start":7000,"end":8000}`},
		{"mgr", "POST", "/api/entries", forMember("4", "1000", "2000"), 409, ``},
		{"mgr", "POST", "/api/entries", forMember("5", "7000", "8000"), 400, `{"error":"unknown member"}`},
		{"dana", "POST", "/api/entries", forMember("5", "7000", "8000"), 400, `{"error":"unknown member"}`},
		{"gina", "POST", "/api/entries", forMember("4", "7000", "8000"), 400, `{"error":"unknown member"}`},
		{"admin", "POST", "/api/entries", forMember("5", "7000", "8000"), 201, ``}, // 5

		// Edit: the delete rule (own entries; admins anyone's in the company) and the create validation.
		{"dana", "PATCH", "/api/entries/1", `{"member":5,"project":1,"task":"Admin","desc":" Review ","tags":[],"billable":true,"start":500,"end":4000}`, 200,
			`{"id":1,"member":4,"project":1,"task":"Admin","desc":"Review","tags":[],"billable":true,"start":500,"end":4000}`},
		{"dana", "PATCH", "/api/entries/1", at("500", "5500"), 409, `{"error":"overlaps another entry"}`},
		{"dana", "PATCH", "/api/entries/1", at("5000", "500"), 400, `{"error":"end must be after start"}`},
		{"dana", "PATCH", "/api/entries/1", strings.Replace(e, `deep-work`, `nope`, 1), 400, `{"error":"unknown tag: nope"}`},
		{"dana", "PATCH", "/api/entries/3", e, 404, ``},
		{"mgr", "PATCH", "/api/entries/1", e, 404, ``},
		{"gina", "PATCH", "/api/entries/1", e, 404, ``},
		{"dana", "PATCH", "/api/entries/abc", e, 400, ``},
		{"dana", "PATCH", "/api/entries/9", e, 404, ``},
		{"admin", "PATCH", "/api/entries/3", at("1000", "2000"), 200, ``},
		{"dana", "GET", "/api/entries", "", 200, `[{"id":4,"member":4,"project":1,"task":"Design","desc":"Mockups","tags":[{"id":1,"name":"deep-work"}],"billable":false,"start":7000,"end":8000},` +
			`{"id":2,"member":4,"project":1,"task":"Design","desc":"Mockups","tags":[{"id":1,"name":"deep-work"}],"billable":false,"start":5000,"end":6000},` +
			`{"id":1,"member":4,"project":1,"task":"Admin","desc":"Review","tags":[],"billable":true,"start":500,"end":4000}]`},
	})

	var es []Entry
	a.db.Order("id").Find(&es)
	for i, want := range []uint{0, 0, 0, 3, 2} {
		if got := es[i].CreatedByID; (got == nil) != (want == 0) || (got != nil && *got != want) {
			t.Errorf("entry %d: created by %v, want %d", es[i].ID, got, want)
		}
	}
}

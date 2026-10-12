package main

import (
	"errors"
	"net/http"
	"slices"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// Who may do what:
//   admin    — everyone in their company: create/edit/deactivate users of any role, create/rename/delete teams.
//   manager  — themself + the members of their teams: create employees in their teams, change which of
//              their teams an employee is in, deactivate employees who are in no other team.
//   employee — only themself.
// The super admin manages companies, can impersonate anyone, and never appears in a user list.
// Nobody is deleted: deactivated users keep their entries (and stay listed) but can't sign in.

func withTeams(u *User) *User {
	if u.Teams == nil {
		u.Teams = []Team{}
	}
	return u
}

func teamIDs(ts []Team) []uint {
	ids := make([]uint, len(ts))
	for i, t := range ts {
		ids[i] = t.ID
	}
	return ids
}

func subset(a, b []uint) bool {
	for _, x := range a {
		if !slices.Contains(b, x) {
			return false
		}
	}
	return true
}

// visibleUsers scopes a users query to the people u may see (see the table above).
func visibleUsers(db *gorm.DB, u *User) *gorm.DB {
	q := db.Model(&User{}).Where("users.company_id = ? AND users.role <> ?", u.CompanyID, RoleSuperAdmin)
	switch u.Role {
	case RoleAdmin:
		return q
	case RoleManager:
		members := db.Table("team_members").Select("user_id").Where("team_id IN ?", teamIDs(u.Teams))
		return q.Where("users.id = ? OR users.id IN (?)", u.ID, members)
	default:
		return q.Where("users.id = ?", u.ID)
	}
}

func idParam(c *gin.Context) (uint, bool) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
	}
	return uint(id), err == nil
}

var errUnknownTeam = errors.New("unknown team")

// companyTeams loads the given team ids, all of which must belong to the company.
func companyTeams(db *gorm.DB, companyID uint, ids []uint) ([]Team, error) {
	ids = slices.Compact(slices.Sorted(slices.Values(ids)))
	teams := []Team{}
	if len(ids) == 0 {
		return teams, nil
	}
	if err := db.Where("company_id = ? AND id IN ?", companyID, ids).Find(&teams).Error; err != nil {
		return nil, err
	}
	if len(teams) != len(ids) {
		return nil, errUnknownTeam
	}
	return teams, nil
}

func listUsers(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		u := me(c)
		q := visibleUsers(db.WithContext(c), u)
		if u.Role == RoleSuperAdmin {
			q = db.WithContext(c).Where("role <> ?", RoleSuperAdmin)
		}
		us := []User{}
		if err := q.Preload("Teams", func(tx *gorm.DB) *gorm.DB { return tx.Order("name") }).Order("users.name").Find(&us).Error; err != nil {
			dbError(c, err)
			return
		}
		for i := range us {
			withTeams(&us[i])
		}
		c.JSON(http.StatusOK, us)
	}
}

type newUser struct {
	Name     string `json:"name" binding:"required,max=100"`
	Email    string `json:"email" binding:"required,email,max=254"`
	Password string `json:"password" binding:"required"`
	Role     string `json:"role" binding:"required,oneof=admin manager employee"`
	Teams    []uint `json:"teams" binding:"max=50"`
}

// build validates the fields and hashes the password; the error message is safe to show.
func (in newUser) build(companyID *uint, teams []Team) (User, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return User{}, errors.New("name is required")
	}
	hash, err := hashPassword(in.Password)
	if err != nil {
		return User{}, err
	}
	return User{CompanyID: companyID, Name: name, Email: strings.TrimSpace(in.Email), PasswordHash: hash, Role: in.Role, Teams: teams, Active: true}, nil
}

func createUser(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		u := me(c)
		var in newUser
		if !bindJSON(c, &in) {
			return
		}
		if u.Role == RoleManager && (in.Role != RoleEmployee || len(in.Teams) == 0 || !subset(in.Teams, teamIDs(u.Teams))) {
			c.JSON(http.StatusForbidden, gin.H{"error": "managers can only create employees in their own teams"})
			return
		}
		teams, err := companyTeams(db.WithContext(c), *u.CompanyID, in.Teams)
		if err != nil {
			teamError(c, err)
			return
		}
		nu, err := in.build(u.CompanyID, teams)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		// Omit: link the existing teams, never upsert them or the company.
		if err := db.WithContext(c).Omit("Company", "Teams.*").Create(&nu).Error; err != nil {
			dbError(c, err)
			return
		}
		c.JSON(http.StatusCreated, nu)
	}
}

// loadVisible finds a user u may see, or answers 404.
func loadVisible(c *gin.Context, db *gorm.DB, u *User) (*User, bool) {
	id, ok := idParam(c)
	if !ok {
		return nil, false
	}
	var t User
	err := visibleUsers(db.WithContext(c), u).Preload("Teams").Where("users.id = ?", id).First(&t).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return nil, false
	}
	if err != nil {
		dbError(c, err)
		return nil, false
	}
	return &t, true
}

// updateUser changes only the fields sent. Admins may change anything but their own role;
// managers only which of their teams an employee is in (other teams are kept).
func updateUser(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		u := me(c)
		var in struct {
			Name     *string `json:"name" binding:"omitempty,max=100"`
			Role     *string `json:"role" binding:"omitempty,oneof=admin manager employee"`
			Password *string `json:"password"`
			Teams    *[]uint `json:"teams" binding:"omitempty,max=50"`
		}
		if !bindJSON(c, &in) {
			return
		}
		t, ok := loadVisible(c, db, u)
		if !ok {
			return
		}
		cols := map[string]any{}
		var teamIDsWanted []uint
		switch u.Role {
		case RoleAdmin:
			if in.Role != nil && t.ID == u.ID && *in.Role != t.Role {
				c.JSON(http.StatusForbidden, gin.H{"error": "you can't change your own role"})
				return
			}
			if in.Teams != nil {
				teamIDsWanted = *in.Teams
			}
		case RoleManager:
			mine := teamIDs(u.Teams)
			if t.Role != RoleEmployee || in.Name != nil || in.Role != nil || in.Password != nil || (in.Teams != nil && !subset(*in.Teams, mine)) {
				c.JSON(http.StatusForbidden, gin.H{"error": "managers can only change which of their teams an employee is in"})
				return
			}
			if in.Teams != nil {
				for _, id := range teamIDs(t.Teams) {
					if !slices.Contains(mine, id) {
						teamIDsWanted = append(teamIDsWanted, id)
					}
				}
				teamIDsWanted = append(teamIDsWanted, *in.Teams...)
			}
		}
		if in.Name != nil {
			name := strings.TrimSpace(*in.Name)
			if name == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
				return
			}
			cols["name"] = name
		}
		if in.Role != nil {
			cols["role"] = *in.Role
		}
		if in.Password != nil {
			hash, err := hashPassword(*in.Password)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			cols["password_hash"] = hash
		}
		var teams []Team
		if in.Teams != nil {
			var err error
			if teams, err = companyTeams(db.WithContext(c), *u.CompanyID, teamIDsWanted); err != nil {
				teamError(c, err)
				return
			}
		}
		err := db.WithContext(c).Transaction(func(tx *gorm.DB) error {
			if len(cols) > 0 {
				if err := tx.Model(&User{}).Where("id = ?", t.ID).Updates(cols).Error; err != nil {
					return err
				}
			}
			if in.Password != nil { // a reset password signs the user out everywhere
				if err := tx.Where("user_id = ?", t.ID).Delete(&Session{}).Error; err != nil {
					return err
				}
			}
			if in.Teams != nil {
				return tx.Model(t).Omit("Teams.*").Association("Teams").Replace(teams)
			}
			return nil
		})
		if err != nil {
			dbError(c, err)
			return
		}
		var out User
		if err := db.WithContext(c).Preload("Teams").First(&out, t.ID).Error; err != nil {
			dbError(c, err)
			return
		}
		c.JSON(http.StatusOK, withTeams(&out))
	}
}

// setUserActive deactivates (signing them out everywhere) or reactivates a user. Their entries are untouched.
// Admins: anyone else in the company. Managers: employees who are only in their teams.
func setUserActive(db *gorm.DB, active bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		u := me(c)
		t, ok := loadVisible(c, db, u)
		if !ok {
			return
		}
		if t.ID == u.ID {
			c.JSON(http.StatusForbidden, gin.H{"error": "you can't deactivate yourself"})
			return
		}
		if u.Role == RoleManager && (t.Role != RoleEmployee || len(t.Teams) == 0 || !subset(teamIDs(t.Teams), teamIDs(u.Teams))) {
			c.JSON(http.StatusForbidden, gin.H{"error": "managers can only deactivate employees who are only in their teams"})
			return
		}
		err := db.WithContext(c).Transaction(func(tx *gorm.DB) error {
			if err := tx.Model(&User{}).Where("id = ?", t.ID).Update("active", active).Error; err != nil {
				return err
			}
			if active {
				return nil
			}
			return tx.Where("user_id = ?", t.ID).Delete(&Session{}).Error
		})
		if err != nil {
			dbError(c, err)
			return
		}
		t.Active = active
		c.JSON(http.StatusOK, withTeams(t))
	}
}

func teamError(c *gin.Context, err error) {
	if errors.Is(err, errUnknownTeam) {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	dbError(c, err)
}

// listTeams: admins get every team in the company, everyone else the teams they're in.
func listTeams(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		u := me(c)
		ts := []Team{}
		q := db.WithContext(c).Where("company_id = ?", *u.CompanyID)
		if u.Role != RoleAdmin {
			q = q.Where("id IN ?", teamIDs(u.Teams))
		}
		if err := q.Order("name").Find(&ts).Error; err != nil {
			dbError(c, err)
			return
		}
		c.JSON(http.StatusOK, ts)
	}
}

func createTeam(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var t Team
		if !bindJSON(c, &t) {
			return
		}
		t.ID, t.CompanyID, t.Name = 0, *me(c).CompanyID, strings.TrimSpace(t.Name)
		if t.Name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
			return
		}
		if err := db.WithContext(c).Omit("Company").Create(&t).Error; err != nil {
			dbError(c, err)
			return
		}
		c.JSON(http.StatusCreated, t)
	}
}

func renameTeam(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, ok := idParam(c)
		if !ok {
			return
		}
		var t Team
		if !bindJSON(c, &t) {
			return
		}
		t.ID, t.CompanyID, t.Name = id, *me(c).CompanyID, strings.TrimSpace(t.Name)
		if t.Name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
			return
		}
		res := db.WithContext(c).Model(&Team{}).Where("id = ? AND company_id = ?", t.ID, t.CompanyID).Update("name", t.Name)
		if res.Error != nil {
			dbError(c, res.Error)
			return
		}
		if res.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		c.JSON(http.StatusOK, t)
	}
}

// deleteTeam removes the team and its memberships; the users stay.
func deleteTeam(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, ok := idParam(c)
		if !ok {
			return
		}
		res := db.WithContext(c).Where("company_id = ?", *me(c).CompanyID).Delete(&Team{}, id)
		if res.Error != nil {
			dbError(c, res.Error)
			return
		}
		if res.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		c.Status(http.StatusNoContent)
	}
}

func listCompanies(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		cs := []Company{}
		if err := db.WithContext(c).Order("name").Find(&cs).Error; err != nil {
			dbError(c, err)
			return
		}
		c.JSON(http.StatusOK, cs)
	}
}

// setCompanyActive deactivates a company (signing out all its users) or reactivates it. Nothing is deleted.
func setCompanyActive(db *gorm.DB, active bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, ok := idParam(c)
		if !ok {
			return
		}
		var co Company
		err := db.WithContext(c).Transaction(func(tx *gorm.DB) error {
			if err := tx.First(&co, id).Error; err != nil {
				return err
			}
			if err := tx.Model(&co).Update("active", active).Error; err != nil {
				return err
			}
			if active {
				return nil
			}
			return tx.Where("user_id IN (?)", tx.Model(&User{}).Select("id").Where("company_id = ?", id)).Delete(&Session{}).Error
		})
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		if err != nil {
			dbError(c, err)
			return
		}
		c.JSON(http.StatusOK, co)
	}
}

// createCompany creates a company together with its first admin, so no company is ever unmanageable.
func createCompany(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var in struct {
			Name  string `json:"name" binding:"required,max=100"`
			Admin struct {
				Name     string `json:"name" binding:"required,max=100"`
				Email    string `json:"email" binding:"required,email,max=254"`
				Password string `json:"password" binding:"required"`
			} `json:"admin"`
		}
		if !bindJSON(c, &in) {
			return
		}
		co := Company{Name: strings.TrimSpace(in.Name), Active: true}
		if co.Name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
			return
		}
		admin, err := newUser{Name: in.Admin.Name, Email: in.Admin.Email, Password: in.Admin.Password, Role: RoleAdmin}.build(nil, nil)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		err = db.WithContext(c).Transaction(func(tx *gorm.DB) error {
			if err := tx.Create(&co).Error; err != nil {
				return err
			}
			admin.CompanyID = &co.ID
			return tx.Omit("Company", "Teams").Create(&admin).Error
		})
		if err != nil {
			dbError(c, err)
			return
		}
		c.JSON(http.StatusCreated, co)
	}
}

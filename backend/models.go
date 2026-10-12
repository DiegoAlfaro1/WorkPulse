package main

// Models double as the JSON API shapes; binding tags validate request bodies.
// NOCASE columns make "Acme" and "acme" the same project/tag/team/email.
// Everything except the super admin belongs to one company; CompanyID always comes from the session, never a body.

const (
	RoleSuperAdmin = "superadmin"
	RoleAdmin      = "admin"
	RoleManager    = "manager"
	RoleEmployee   = "employee"
)

// Company: a deactivated company's users can't sign in; nothing is deleted.
type Company struct {
	ID     uint   `json:"id"`
	Name   string `json:"name" gorm:"type:text collate nocase;not null;uniqueIndex"`
	Active bool   `json:"active" gorm:"not null;default:true"`
}

type Team struct {
	ID        uint    `json:"id"`
	CompanyID uint    `json:"-" gorm:"not null;uniqueIndex:idx_teams_company_name"`
	Company   Company `json:"-" gorm:"constraint:OnDelete:CASCADE"`
	Name      string  `json:"name" gorm:"type:text collate nocase;not null;uniqueIndex:idx_teams_company_name" binding:"max=100"`
}

// User: the super admin is the only one without a company. A manager manages every team they belong to.
// Users are deactivated, never deleted, so their time entries stay in the reports.
type User struct {
	ID           uint     `json:"id"`
	CompanyID    *uint    `json:"company" gorm:"index"`
	Company      *Company `json:"-" gorm:"constraint:OnDelete:CASCADE"`
	Name         string   `json:"name" gorm:"not null"`
	Email        string   `json:"email" gorm:"type:text collate nocase;not null;uniqueIndex"`
	PasswordHash []byte   `json:"-" gorm:"not null"`
	Role         string   `json:"role" gorm:"not null;check:chk_users_role,role IN ('superadmin','admin','manager','employee')"`
	Teams        []Team   `json:"teams" gorm:"many2many:team_members;constraint:OnDelete:CASCADE"`
	Active       bool     `json:"active" gorm:"not null;default:true"`
}

// Session is one login. Only the SHA-256 of its bearer token is stored, so a leaked database can't be replayed.
type Session struct {
	ID             uint
	TokenHash      []byte `gorm:"not null;uniqueIndex"`
	UserID         uint   `gorm:"not null;index"`
	User           User   `gorm:"constraint:OnDelete:CASCADE"`
	ImpersonatorID *uint  // the super admin who opened this session, if any
	ExpiresAt      int64  `gorm:"not null;index"` // Unix ms
}

type Project struct {
	ID        uint    `json:"id"`
	CompanyID uint    `json:"-" gorm:"not null;uniqueIndex:idx_projects_company_name_client"`
	Company   Company `json:"-" gorm:"constraint:OnDelete:CASCADE"`
	Name      string  `json:"name" gorm:"type:text collate nocase;not null;uniqueIndex:idx_projects_company_name_client" binding:"max=100"`
	Client    string  `json:"client" gorm:"type:text collate nocase;not null;uniqueIndex:idx_projects_company_name_client" binding:"max=100"`
	Billable  bool    `json:"billable" gorm:"not null"`
	Color     string  `json:"color" gorm:"not null;default:''" binding:"omitempty,hexcolor,max=7"` // "" = frontend picks one
}

type Tag struct {
	ID        uint    `json:"id"`
	CompanyID uint    `json:"-" gorm:"not null;uniqueIndex:idx_tags_company_name"`
	Company   Company `json:"-" gorm:"constraint:OnDelete:CASCADE"`
	Name      string  `json:"name" gorm:"type:text collate nocase;not null;uniqueIndex:idx_tags_company_name" binding:"max=50"`
}

// Entry is a finished block of tracked time. Times are Unix milliseconds, matching the frontend's Date.now().
// UserID is the signed-in user, unless an admin or manager added it for someone they can see (CreatedByID).
type Entry struct {
	ID        uint    `json:"id"`
	UserID    uint    `json:"member" gorm:"not null;index"`
	User      User    `json:"-" gorm:"constraint:OnDelete:CASCADE"`
	ProjectID uint    `json:"project" gorm:"not null" binding:"required"`
	Project   Project `json:"-"` // only here so the table gets the foreign key
	Task      string  `json:"task" gorm:"not null" binding:"required,max=100"`
	Desc      string  `json:"desc" gorm:"column:description;not null" binding:"max=500"`
	Tags      []Tag   `json:"tags" gorm:"many2many:entry_tags;constraint:OnDelete:CASCADE" binding:"max=20"`
	Billable  bool    `json:"billable" gorm:"not null"`
	Start     int64   `json:"start" gorm:"column:start_ms;not null" binding:"required"`
	End       int64   `json:"end" gorm:"column:end_ms;not null;check:end_ms > start_ms" binding:"required,gtfield=Start"`
	// ImpersonatorID: the super admin who created it while signed in as the user; never from the body.
	ImpersonatorID *uint `json:"-"`
	// CreatedByID: the admin or manager who added it for the member; never from the body.
	CreatedByID *uint `json:"-"`
}

// ImpersonationLog records every "sign in as" (audit trail; never shown in the app).
type ImpersonationLog struct {
	ID           uint
	SuperAdminID uint  `gorm:"not null"`
	UserID       uint  `gorm:"not null;index"`
	At           int64 `gorm:"not null"` // Unix ms
}

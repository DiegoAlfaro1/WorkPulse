package main

// Models double as the JSON API shapes; binding tags validate request bodies.
// NOCASE columns make "Acme" and "acme" the same project/tag.

type Project struct {
	ID       uint   `json:"id"`
	Name     string `json:"name" gorm:"type:text collate nocase;not null;uniqueIndex:idx_projects_name_client" binding:"max=100"`
	Client   string `json:"client" gorm:"type:text collate nocase;not null;uniqueIndex:idx_projects_name_client" binding:"max=100"`
	Billable bool   `json:"billable" gorm:"not null"`
}

type Tag struct {
	ID   uint   `json:"id"`
	Name string `json:"name" gorm:"type:text collate nocase;not null;uniqueIndex" binding:"max=50"`
}

// Entry is a finished block of tracked time. Times are Unix milliseconds, matching the frontend's Date.now().
// ponytail: Member is the frontend's user id string; becomes a users FK once there is auth.
type Entry struct {
	ID        uint    `json:"id"`
	Member    string  `json:"member" gorm:"not null" binding:"required,max=50"`
	ProjectID uint    `json:"project" gorm:"not null" binding:"required"`
	Project   Project `json:"-"` // only here so the table gets the foreign key
	Task      string  `json:"task" gorm:"not null" binding:"required,max=100"`
	Desc      string  `json:"desc" gorm:"column:description;not null" binding:"max=500"`
	Tags      []Tag   `json:"tags" gorm:"many2many:entry_tags;constraint:OnDelete:CASCADE" binding:"max=20"`
	Billable  bool    `json:"billable" gorm:"not null"`
	Start     int64   `json:"start" gorm:"column:start_ms;not null" binding:"required"`
	End       int64   `json:"end" gorm:"column:end_ms;not null;check:end_ms > start_ms" binding:"required,gtfield=Start"`
}

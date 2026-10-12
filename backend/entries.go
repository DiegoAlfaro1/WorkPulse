package main

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// listEntries returns the entries of every user the caller may see (see visibleUsers).
// ponytail: returns all of them; add from/to query params once the table gets big.
func listEntries(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		es := []Entry{}
		users := visibleUsers(db, me(c)).Select("users.id")
		if err := db.WithContext(c).Preload("Tags").Where("user_id IN (?)", users).Order("start_ms DESC").Find(&es).Error; err != nil {
			dbError(c, err)
			return
		}
		for i := range es {
			if es[i].Tags == nil {
				es[i].Tags = []Tag{}
			}
		}
		c.JSON(http.StatusOK, es)
	}
}

const (
	maxEntry  = 24 * time.Hour
	clockSkew = 5 * time.Minute // how far in the future an entry may end (client clocks drift)
)

// createEntry records time for the signed-in user, or, when the body names a member the caller may see
// (visibleUsers: a manager's team, an admin's company), for that member; CreatedByID then records the caller.
func createEntry(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var e Entry
		if !bindJSON(c, &e) {
			return
		}
		u := me(c)
		member := e.UserID
		e.ID, e.UserID, e.ImpersonatorID, e.CreatedByID = 0, u.ID, session(c).ImpersonatorID, nil
		if member != 0 && member != u.ID {
			var n int64
			if err := visibleUsers(db.WithContext(c), u).Where("users.id = ?", member).Count(&n).Error; err != nil {
				dbError(c, err)
				return
			}
			if n == 0 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "unknown member"})
				return
			}
			e.UserID, e.CreatedByID = member, &u.ID
		}
		if checkEntry(c, db, *u.CompanyID, &e) && saveEntry(c, db, &e) {
			c.JSON(http.StatusCreated, e)
		}
	}
}

// updateEntry replaces the editable fields of an entry the caller may delete (see entryOwners), with the same
// validation as createEntry. Who it belongs to and who created it never change.
func updateEntry(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, ok := idParam(c)
		if !ok {
			return
		}
		u := me(c)
		var old Entry
		err := db.WithContext(c).Where("user_id IN (?)", entryOwners(db, u)).First(&old, id).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		if err != nil {
			dbError(c, err)
			return
		}
		var e Entry
		if !bindJSON(c, &e) {
			return
		}
		e.ID, e.UserID, e.ImpersonatorID, e.CreatedByID = old.ID, old.UserID, old.ImpersonatorID, old.CreatedByID
		if checkEntry(c, db, *u.CompanyID, &e) && saveEntry(c, db, &e) {
			c.JSON(http.StatusOK, e)
		}
	}
}

// checkEntry validates a bound entry: times, a description, one of the company's projects, and tags by name
// ({"name": ...}), which it swaps for the company's existing tags; it never creates tags. Answers 400 and returns false otherwise.
func checkEntry(c *gin.Context, db *gorm.DB, companyID uint, e *Entry) bool {
	if time.Duration(e.End-e.Start)*time.Millisecond > maxEntry {
		c.JSON(http.StatusBadRequest, gin.H{"error": "an entry can't be longer than 24 hours"})
		return false
	}
	if e.End > time.Now().Add(clockSkew).UnixMilli() {
		c.JSON(http.StatusBadRequest, gin.H{"error": "an entry can't end in the future"})
		return false
	}
	e.Desc = strings.TrimSpace(e.Desc)
	if e.Desc == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "description is required"})
		return false
	}

	var n int64
	if err := db.WithContext(c).Model(&Project{}).Where("id = ? AND company_id = ?", e.ProjectID, companyID).Count(&n).Error; err != nil {
		dbError(c, err)
		return false
	}
	if n == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unknown project"})
		return false
	}

	names := make([]string, len(e.Tags))
	for i, t := range e.Tags {
		names[i] = t.Name
	}
	e.Tags = []Tag{}
	if len(names) > 0 {
		if err := db.WithContext(c).Where("company_id = ? AND name IN ?", companyID, names).Find(&e.Tags).Error; err != nil {
			dbError(c, err)
			return false
		}
		for _, n := range names {
			if !hasTag(e.Tags, n) {
				c.JSON(http.StatusBadRequest, gin.H{"error": "unknown tag: " + n})
				return false
			}
		}
	}
	return true
}

var errOverlap = errors.New("overlap")

// saveEntry creates (ID 0) or updates e and its tag links in one transaction, refusing it with 409 if it overlaps
// another entry of the same member: overlaps would count the same hour twice in every report.
func saveEntry(c *gin.Context, db *gorm.DB, e *Entry) bool {
	err := db.WithContext(c).Transaction(func(tx *gorm.DB) error {
		var n int64
		if err := tx.Model(&Entry{}).Where("user_id = ? AND id <> ? AND start_ms < ? AND end_ms > ?", e.UserID, e.ID, e.End, e.Start).Count(&n).Error; err != nil {
			return err
		}
		if n > 0 {
			return errOverlap
		}
		if e.ID != 0 {
			if err := tx.Table("entry_tags").Where("entry_id = ?", e.ID).Delete(nil).Error; err != nil {
				return err
			}
		}
		// Omit: don't upsert the empty Project/User or the tags themselves, only write the entry_tags links.
		return tx.Omit("Project", "User", "Tags.*").Save(e).Error
	})
	switch {
	case errors.Is(err, errOverlap):
		c.JSON(http.StatusConflict, gin.H{"error": "overlaps another entry"})
	case err != nil:
		dbError(c, err)
	}
	return err == nil
}

// entryOwners: whose entries u may edit or delete: their own; an admin, anyone's in the company.
func entryOwners(db *gorm.DB, u *User) *gorm.DB {
	if u.Role == RoleAdmin {
		return visibleUsers(db, u).Select("users.id")
	}
	return db.Model(&User{}).Select("id").Where("id = ?", u.ID)
}

// deleteEntry removes an entry the caller may delete (see entryOwners); its entry_tags links go with it (ON DELETE CASCADE).
func deleteEntry(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, ok := idParam(c)
		if !ok {
			return
		}
		res := db.WithContext(c).Where("user_id IN (?)", entryOwners(db, me(c))).Delete(&Entry{}, id)
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

func hasTag(tags []Tag, name string) bool {
	for _, t := range tags {
		if strings.EqualFold(t.Name, name) {
			return true
		}
	}
	return false
}

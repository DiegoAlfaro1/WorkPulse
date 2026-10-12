package main

import (
	"net/http"
	"strings"

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

// createEntry records time for the signed-in user. It requires a description and one of the company's projects,
// and takes tags by name ({"name": ...}), linking the company's existing tags; it never creates tags.
func createEntry(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var e Entry
		if err := c.ShouldBindJSON(&e); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		u := me(c)
		e.ID, e.UserID = 0, u.ID
		e.Desc = strings.TrimSpace(e.Desc)
		if e.Desc == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "description is required"})
			return
		}

		var n int64
		if err := db.WithContext(c).Model(&Project{}).Where("id = ? AND company_id = ?", e.ProjectID, *u.CompanyID).Count(&n).Error; err != nil {
			dbError(c, err)
			return
		}
		if n == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "unknown project"})
			return
		}

		names := make([]string, len(e.Tags))
		for i, t := range e.Tags {
			names[i] = t.Name
		}
		e.Tags = []Tag{}
		if len(names) > 0 {
			if err := db.WithContext(c).Where("company_id = ? AND name IN ?", *u.CompanyID, names).Find(&e.Tags).Error; err != nil {
				dbError(c, err)
				return
			}
			for _, n := range names {
				if !hasTag(e.Tags, n) {
					c.JSON(http.StatusBadRequest, gin.H{"error": "unknown tag: " + n})
					return
				}
			}
		}

		// Omit: don't upsert the empty Project/User or the tags themselves, only write the entry_tags links.
		// Create wraps the entry and its links in one transaction.
		if err := db.WithContext(c).Omit("Project", "User", "Tags.*").Create(&e).Error; err != nil {
			dbError(c, err)
			return
		}
		c.JSON(http.StatusCreated, e)
	}
}

// deleteEntry removes one of the caller's own entries (an admin: anyone's in the company);
// its entry_tags links go with it (ON DELETE CASCADE).
func deleteEntry(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, ok := idParam(c)
		if !ok {
			return
		}
		u := me(c)
		owners := db.Model(&User{}).Select("id").Where("id = ?", u.ID)
		if u.Role == RoleAdmin {
			owners = visibleUsers(db, u).Select("users.id")
		}
		res := db.WithContext(c).Where("user_id IN (?)", owners).Delete(&Entry{}, id)
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

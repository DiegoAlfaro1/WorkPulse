package main

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ponytail: returns every entry; add from/to query params once the table gets big.
func listEntries(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		es := []Entry{}
		if err := db.WithContext(c).Preload("Tags").Order("start_ms DESC").Find(&es).Error; err != nil {
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

// createEntry takes tags by name ({"name": ...}) and links the existing tags; it never creates tags.
func createEntry(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var e Entry
		if err := c.ShouldBindJSON(&e); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		e.ID = 0
		e.Desc = strings.TrimSpace(e.Desc)

		names := make([]string, len(e.Tags))
		for i, t := range e.Tags {
			names[i] = t.Name
		}
		e.Tags = []Tag{}
		if len(names) > 0 {
			if err := db.WithContext(c).Where("name IN ?", names).Find(&e.Tags).Error; err != nil {
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

		// Omit: don't upsert the empty Project or the tags themselves, only write the entry_tags links.
		// Create wraps the entry and its links in one transaction.
		if err := db.WithContext(c).Omit("Project", "Tags.*").Create(&e).Error; err != nil {
			dbError(c, err)
			return
		}
		c.JSON(http.StatusCreated, e)
	}
}

// deleteEntry removes the entry; its entry_tags links go with it (ON DELETE CASCADE).
func deleteEntry(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
			return
		}
		res := db.WithContext(c).Delete(&Entry{}, id)
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

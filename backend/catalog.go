package main

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func listProjects(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		ps := []Project{}
		if err := db.WithContext(c).Where("company_id = ?", *me(c).CompanyID).Order("id").Find(&ps).Error; err != nil {
			dbError(c, err)
			return
		}
		c.JSON(http.StatusOK, ps)
	}
}

func createProject(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var p Project
		if !bindJSON(c, &p) {
			return
		}
		p.ID, p.CompanyID = 0, *me(c).CompanyID // never taken from the client
		p.Name, p.Client = strings.TrimSpace(p.Name), strings.TrimSpace(p.Client)
		if p.Name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
			return
		}
		if err := db.WithContext(c).Omit("Company").Create(&p).Error; err != nil {
			dbError(c, err)
			return
		}
		c.JSON(http.StatusCreated, p)
	}
}

func listTags(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		ts := []Tag{}
		if err := db.WithContext(c).Where("company_id = ?", *me(c).CompanyID).Order("name").Find(&ts).Error; err != nil {
			dbError(c, err)
			return
		}
		c.JSON(http.StatusOK, ts)
	}
}

func createTag(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var t Tag
		if !bindJSON(c, &t) {
			return
		}
		t.ID, t.CompanyID = 0, *me(c).CompanyID
		t.Name = strings.TrimPrefix(strings.TrimSpace(t.Name), "#")
		if t.Name == "" || strings.ContainsAny(t.Name, " \t\n") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "name is required and must not contain spaces"})
			return
		}
		if err := db.WithContext(c).Omit("Company").Create(&t).Error; err != nil {
			dbError(c, err)
			return
		}
		c.JSON(http.StatusCreated, t)
	}
}

// dbError maps unique violations to 409 and foreign-key violations (in practice entries.project_id) to 400;
// anything else is logged and hidden behind a 500.
func dbError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, gorm.ErrDuplicatedKey):
		c.JSON(http.StatusConflict, gin.H{"error": "already exists"})
	case errors.Is(err, gorm.ErrForeignKeyViolated):
		c.JSON(http.StatusBadRequest, gin.H{"error": "unknown project"})
	default:
		c.Error(err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
	}
}

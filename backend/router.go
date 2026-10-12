package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func newRouter(db *gorm.DB) *gin.Engine {
	r := gin.Default()
	r.SetTrustedProxies(nil) // ponytail: ignores X-Forwarded-For; trust nginx's IP here once ClientIP() matters

	api := r.Group("/api")
	api.GET("/projects", listProjects(db))
	api.POST("/projects", createProject(db))
	api.GET("/tags", listTags(db))
	api.POST("/tags", createTag(db))
	api.GET("/entries", listEntries(db))
	api.POST("/entries", createEntry(db))

	api.GET("/health", func(c *gin.Context) {
		sqlDB, err := db.DB()
		if err == nil {
			err = sqlDB.PingContext(c.Request.Context())
		}
		if err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "db unavailable"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	return r
}

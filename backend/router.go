package main

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
)

func newRouter(db *sql.DB) *gin.Engine {
	r := gin.Default()
	r.SetTrustedProxies(nil) // ponytail: ignores X-Forwarded-For; trust nginx's IP here once ClientIP() matters

	api := r.Group("/api")
	// Feature routes go on api too, e.g. api.GET("/projects", listProjects).

	api.GET("/health", func(c *gin.Context) {
		if err := db.PingContext(c.Request.Context()); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "db unavailable"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	return r
}

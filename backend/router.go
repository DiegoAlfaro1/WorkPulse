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
	api.POST("/auth/login", login(db)) // brute force is throttled by nginx (limit_req)

	authed := api.Group("", requireAuth(db))
	authed.GET("/auth/me", getMe)
	authed.POST("/auth/logout", logout(db))
	authed.POST("/auth/password", changePassword(db))
	authed.GET("/users", listUsers(db))

	super := authed.Group("", requireRole(RoleSuperAdmin))
	super.POST("/auth/impersonate", impersonate(db))
	super.GET("/companies", listCompanies(db))
	super.POST("/companies", createCompany(db))
	super.POST("/companies/:id/deactivate", setCompanyActive(db, false))
	super.POST("/companies/:id/activate", setCompanyActive(db, true))

	company := authed.Group("", requireCompany)
	company.GET("/projects", listProjects(db))
	company.POST("/projects", createProject(db))
	company.GET("/tags", listTags(db))
	company.POST("/tags", createTag(db))
	company.GET("/entries", listEntries(db))
	company.POST("/entries", createEntry(db))
	company.DELETE("/entries/:id", deleteEntry(db))
	company.GET("/teams", listTeams(db))

	managers := company.Group("", requireRole(RoleAdmin, RoleManager))
	managers.POST("/users", createUser(db))
	managers.PATCH("/users/:id", updateUser(db))
	managers.POST("/users/:id/deactivate", setUserActive(db, false))
	managers.POST("/users/:id/activate", setUserActive(db, true))

	admins := company.Group("", requireRole(RoleAdmin))
	admins.POST("/teams", createTeam(db))
	admins.PATCH("/teams/:id", renameTeam(db))
	admins.DELETE("/teams/:id", deleteTeam(db))

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

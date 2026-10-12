package main

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"modernc.org/sqlite"
	sqlite3 "modernc.org/sqlite/lib"
)

type project struct {
	ID       int64  `json:"id"`
	Name     string `json:"name" binding:"max=100"`
	Client   string `json:"client" binding:"max=100"`
	Billable bool   `json:"billable"`
}

type tag struct {
	ID   int64  `json:"id"`
	Name string `json:"name" binding:"max=50"`
}

func listProjects(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		rows, err := db.QueryContext(c.Request.Context(), "SELECT id, name, client, billable FROM projects ORDER BY id")
		if err != nil {
			dbError(c, err)
			return
		}
		defer rows.Close()
		ps := []project{}
		for rows.Next() {
			var p project
			if err := rows.Scan(&p.ID, &p.Name, &p.Client, &p.Billable); err != nil {
				dbError(c, err)
				return
			}
			ps = append(ps, p)
		}
		if err := rows.Err(); err != nil {
			dbError(c, err)
			return
		}
		c.JSON(http.StatusOK, ps)
	}
}

func createProject(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var p project
		if err := c.ShouldBindJSON(&p); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		p.Name, p.Client = strings.TrimSpace(p.Name), strings.TrimSpace(p.Client)
		if p.Name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
			return
		}
		res, err := db.ExecContext(c.Request.Context(),
			"INSERT INTO projects (name, client, billable) VALUES (?, ?, ?)", p.Name, p.Client, p.Billable)
		if err != nil {
			dbError(c, err)
			return
		}
		p.ID, _ = res.LastInsertId()
		c.JSON(http.StatusCreated, p)
	}
}

func listTags(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		rows, err := db.QueryContext(c.Request.Context(), "SELECT id, name FROM tags ORDER BY name")
		if err != nil {
			dbError(c, err)
			return
		}
		defer rows.Close()
		ts := []tag{}
		for rows.Next() {
			var t tag
			if err := rows.Scan(&t.ID, &t.Name); err != nil {
				dbError(c, err)
				return
			}
			ts = append(ts, t)
		}
		if err := rows.Err(); err != nil {
			dbError(c, err)
			return
		}
		c.JSON(http.StatusOK, ts)
	}
}

func createTag(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var t tag
		if err := c.ShouldBindJSON(&t); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		t.Name = strings.TrimPrefix(strings.TrimSpace(t.Name), "#")
		if t.Name == "" || strings.ContainsAny(t.Name, " \t\n") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "name is required and must not contain spaces"})
			return
		}
		res, err := db.ExecContext(c.Request.Context(), "INSERT INTO tags (name) VALUES (?)", t.Name)
		if err != nil {
			dbError(c, err)
			return
		}
		t.ID, _ = res.LastInsertId()
		c.JSON(http.StatusCreated, t)
	}
}

// dbError maps unique-constraint violations to 409; anything else is logged and hidden behind a 500.
func dbError(c *gin.Context, err error) {
	var se *sqlite.Error
	if errors.As(err, &se) && se.Code() == sqlite3.SQLITE_CONSTRAINT_UNIQUE {
		c.JSON(http.StatusConflict, gin.H{"error": "already exists"})
		return
	}
	c.Error(err)
	c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
}

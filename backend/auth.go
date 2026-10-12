package main

import (
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// ponytail: fixed lifetime, no refresh; add sliding expiry if weekly re-logins annoy people.
const sessionTTL = 7 * 24 * time.Hour

// dummyHash makes a login for an unknown email cost the same bcrypt time as a wrong password (no user enumeration).
var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("not-a-real-password"), bcrypt.DefaultCost)

func hashToken(token string) []byte { h := sha256.Sum256([]byte(token)); return h[:] }

// hashPassword enforces the password rules; the error message is safe to show.
// bcrypt ignores everything past 72 bytes, so longer passwords are refused rather than silently truncated.
func hashPassword(pw string) ([]byte, error) {
	if len([]rune(pw)) < 8 || len(pw) > 72 {
		return nil, errors.New("password must be 8 to 72 bytes long")
	}
	return bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
}

// newSession stores a session and returns its bearer token (128 random bits).
func newSession(db *gorm.DB, userID uint, impersonator *uint) (string, int64, error) {
	token := rand.Text()
	exp := time.Now().Add(sessionTTL).UnixMilli()
	err := db.Omit("User").Create(&Session{TokenHash: hashToken(token), UserID: userID, ImpersonatorID: impersonator, ExpiresAt: exp}).Error
	return token, exp, err
}

// requireAuth loads the bearer token's session and user (with teams) into the context, or answers 401.
func requireAuth(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		token, ok := strings.CutPrefix(c.GetHeader("Authorization"), "Bearer ")
		if !ok || token == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "not signed in"})
			return
		}
		var s Session
		err := db.WithContext(c).Preload("User.Teams").Preload("User.Company").
			Where("token_hash = ? AND expires_at > ?", hashToken(token), time.Now().UnixMilli()).First(&s).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "session expired, sign in again"})
			return
		}
		if err != nil {
			dbError(c, err)
			c.Abort()
			return
		}
		if !canSignIn(&s.User) { // deactivation also deletes sessions; this covers any that slip through
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "this account is deactivated"})
			return
		}
		c.Set("session", &s)
	}
}

// canSignIn: the user and their company (if any) are active. Needs User.Company loaded.
func canSignIn(u *User) bool { return u.Active && (u.Company == nil || u.Company.Active) }

func session(c *gin.Context) *Session { return c.MustGet("session").(*Session) }
func me(c *gin.Context) *User         { return &session(c).User }

func requireRole(roles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !slices.Contains(roles, me(c).Role) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "not allowed"})
		}
	}
}

// requireCompany guards company data; after it, me(c).CompanyID is non-nil.
func requireCompany(c *gin.Context) {
	if me(c).CompanyID == nil {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "the super admin has no company data; impersonate a user first"})
	}
}

func issueSession(c *gin.Context, db *gorm.DB, u *User, impersonator *uint) {
	token, exp, err := newSession(db.WithContext(c), u.ID, impersonator)
	if err != nil {
		dbError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": token, "expiresAt": exp, "user": withTeams(u)})
}

func login(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var in struct {
			Email    string `json:"email" binding:"required,max=254"`
			Password string `json:"password" binding:"required,max=200"`
		}
		if err := c.ShouldBindJSON(&in); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		var u User
		err := db.WithContext(c).Preload("Teams").Preload("Company").Where("email = ?", strings.TrimSpace(in.Email)).First(&u).Error
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			dbError(c, err)
			return
		}
		hash := dummyHash
		if err == nil {
			hash = u.PasswordHash
		}
		if bcrypt.CompareHashAndPassword(hash, []byte(in.Password)) != nil || err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "wrong email or password"})
			return
		}
		if !canSignIn(&u) { // only said after a correct password, so it doesn't reveal which emails exist
			c.JSON(http.StatusForbidden, gin.H{"error": "this account is deactivated"})
			return
		}
		db.WithContext(c).Where("expires_at <= ?", time.Now().UnixMilli()).Delete(&Session{}) // housekeeping; failure is harmless
		issueSession(c, db, &u, nil)
	}
}

func logout(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if err := db.WithContext(c).Delete(&Session{}, session(c).ID).Error; err != nil {
			dbError(c, err)
			return
		}
		c.Status(http.StatusNoContent)
	}
}

func getMe(c *gin.Context) {
	s := session(c)
	c.JSON(http.StatusOK, gin.H{"user": withTeams(&s.User), "impersonating": s.ImpersonatorID != nil})
}

// changePassword also signs the user out everywhere else.
func changePassword(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var in struct {
			Current string `json:"current" binding:"required,max=200"`
			New     string `json:"new" binding:"required"`
		}
		if err := c.ShouldBindJSON(&in); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		s := session(c)
		// 403, not 401: the session is fine, and the frontend treats 401 as "signed out".
		if bcrypt.CompareHashAndPassword(s.User.PasswordHash, []byte(in.Current)) != nil {
			c.JSON(http.StatusForbidden, gin.H{"error": "current password is wrong"})
			return
		}
		hash, err := hashPassword(in.New)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		err = db.WithContext(c).Transaction(func(tx *gorm.DB) error {
			if err := tx.Model(&User{}).Where("id = ?", s.UserID).Update("password_hash", hash).Error; err != nil {
				return err
			}
			return tx.Where("user_id = ? AND id <> ?", s.UserID, s.ID).Delete(&Session{}).Error
		})
		if err != nil {
			dbError(c, err)
			return
		}
		c.Status(http.StatusNoContent)
	}
}

// impersonate (super admin only) opens a session as any other user.
func impersonate(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var in struct {
			User uint `json:"user" binding:"required"`
		}
		if err := c.ShouldBindJSON(&in); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		var u User
		err := db.WithContext(c).Preload("Teams").Preload("Company").Where("id = ? AND role <> ?", in.User, RoleSuperAdmin).First(&u).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		if err != nil {
			dbError(c, err)
			return
		}
		if !canSignIn(&u) {
			c.JSON(http.StatusForbidden, gin.H{"error": "this account is deactivated"})
			return
		}
		issueSession(c, db, &u, &me(c).ID)
	}
}

// seedSuperAdmin creates the one super admin on first start; it never touches an existing one.
func seedSuperAdmin(db *gorm.DB, email, password string) error {
	var n int64
	if err := db.Model(&User{}).Where("role = ?", RoleSuperAdmin).Count(&n).Error; err != nil || n > 0 {
		return err
	}
	if email == "" {
		return errors.New("no super admin yet: set SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD")
	}
	hash, err := hashPassword(password)
	if err != nil {
		return errors.New("SUPERADMIN_PASSWORD: " + err.Error())
	}
	return db.Create(&User{Name: "Super admin", Email: strings.TrimSpace(email), PasswordHash: hash, Role: RoleSuperAdmin}).Error
}

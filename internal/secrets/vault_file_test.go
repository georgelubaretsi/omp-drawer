package secrets

import (
	"path/filepath"
	"testing"
)

func TestFileVault(t *testing.T) {
	conformance(t, fileVault{filepath.Join(t.TempDir(), "demo", "secrets.json")})
}

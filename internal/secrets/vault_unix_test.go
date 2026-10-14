//go:build !darwin && !windows

package secrets

import (
	"path/filepath"
	"testing"
)

// TestSystemVault checks the vault this session gets: the Secret Service when one answers on the
// session bus, else the file. CI runs it both ways (.github/workflows/check.yml). On a desktop it
// adds and removes items under testService in the person's keyring.
func TestSystemVault(t *testing.T) {
	v := systemVault(testService, filepath.Join(t.TempDir(), "secrets.json"))
	_, isSecretService := v.(osVault)
	if isSecretService != secretService() {
		t.Fatalf("the system vault is %T while a Secret Service answers: %v", v, secretService())
	}
	if isSecretService {
		t.Log("system vault: secret-service")
	} else {
		t.Log("system vault: file")
	}
	conformance(t, v)
}

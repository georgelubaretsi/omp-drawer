package secrets

import (
	"path/filepath"
	"testing"

	"github.com/ebitengine/purego"
)

// throwawayKeychain is a new keychain file in a temp folder, deleted after the test: the tests
// never touch the person's own keychains.
func throwawayKeychain(t *testing.T) uintptr {
	t.Helper()
	sec, err := purego.Dlopen("/System/Library/Frameworks/Security.framework/Security", purego.RTLD_LAZY)
	if err != nil {
		t.Fatal(err)
	}
	var create func(path string, passwordLength uint32, password string, prompt bool, access uintptr, keychain *uintptr) int32
	var remove func(keychain uintptr) int32
	purego.RegisterLibFunc(&create, sec, "SecKeychainCreate")
	purego.RegisterLibFunc(&remove, sec, "SecKeychainDelete")
	var ref uintptr
	if status := create(filepath.Join(t.TempDir(), "test.keychain-db"), 4, "test", false, 0, &ref); status != errSecSuccess {
		t.Fatalf("SecKeychainCreate: %d", status)
	}
	t.Cleanup(func() {
		if status := remove(ref); status != errSecSuccess {
			t.Errorf("SecKeychainDelete: %d", status)
		}
		if a, err := security(); err == nil {
			a.release(ref)
		}
	})
	return ref
}

func TestKeychainVault(t *testing.T) {
	conformance(t, keychain{service: testService, file: throwawayKeychain(t)})
}

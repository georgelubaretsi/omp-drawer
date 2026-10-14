package secrets

import "testing"

// TestCredentialManagerVault adds and removes items under testService in the person's Credential
// Manager; CI runs it on a Windows runner.
func TestCredentialManagerVault(t *testing.T) {
	conformance(t, systemVault(testService, ""))
}

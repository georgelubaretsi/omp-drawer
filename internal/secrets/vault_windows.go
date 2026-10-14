package secrets

// systemVault is Windows Credential Manager, the program's items named after service. file is
// unused: every Windows has Credential Manager.
func systemVault(service, _ string) vault { return osVault{service, "credential-manager"} }

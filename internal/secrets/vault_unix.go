//go:build !darwin && !windows

package secrets

import ss "github.com/zalando/go-keyring/secret_service"

// systemVault is the Secret Service when one answers on the session bus, else the file: servers,
// containers and some desktops run none.
func systemVault(service, file string) vault {
	if secretService() {
		return osVault{service, "secret-service"}
	}
	return fileVault{file}
}

// secretService reports whether a Secret Service opens a session on the session bus.
func secretService() bool {
	svc, err := ss.NewSecretService()
	if err != nil {
		return false
	}
	session, err := svc.OpenSession()
	if err != nil {
		return false
	}
	_ = svc.Close(session)
	return true
}

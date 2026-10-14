//go:build !darwin

package secrets

// The system's secret store through go-keyring: Windows Credential Manager, or the Secret Service
// (GNOME Keyring, KWallet) on Linux. Credential Manager and the Secret Service keep a secret per
// person, not per program: any program running as that person can read it.

import (
	"errors"
	"time"

	keyring "github.com/zalando/go-keyring"

	"piebird.dev/plugins/internal/text"
)

// answerWithin bounds a call to the Secret Service, which may wait for the person to unlock their
// keyring, and never answers when no one can.
const answerWithin = 2 * time.Minute

// osVault keeps the program's secrets under service; kind names the store (Source.Kind).
type osVault struct{ service, kind string }

// answer runs fn, or gives up after answerWithin.
func (v osVault) answer(fn func() error) error {
	done := make(chan error, 1)
	go func() { done <- fn() }()
	select {
	case err := <-done:
		return err
	case <-time.After(answerWithin):
		return texts.Get("errors/no-answer").Err(text.V{"Minutes": int(answerWithin.Minutes())})
	}
}

func (v osVault) get(key string) (string, bool, error) {
	var secret string
	err := v.answer(func() (err error) {
		secret, err = keyring.Get(v.service, key)
		return err
	})
	if errors.Is(err, keyring.ErrNotFound) {
		return "", false, nil
	}
	return secret, err == nil && secret != "", err
}

func (v osVault) set(key, _, secret string) error {
	return v.answer(func() error { return keyring.Set(v.service, key, secret) })
}

func (v osVault) forget(key string) error {
	err := v.answer(func() error { return keyring.Delete(v.service, key) })
	if errors.Is(err, keyring.ErrNotFound) {
		return nil
	}
	return err
}

func (v osVault) source() Source { return Source{Kind: v.kind} }

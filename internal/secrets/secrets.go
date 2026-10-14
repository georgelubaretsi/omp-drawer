package secrets

import (
	"embed"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"

	"piebird.dev/plugins/internal/dirs"
	"piebird.dev/plugins/internal/ops"
	"piebird.dev/plugins/internal/text"
)

//go:embed templates
var files embed.FS

var texts = text.Must(files, "templates")

// vault keeps a program's secrets by key.
type vault interface {
	get(key string) (secret string, ok bool, err error)
	set(key, label, secret string) error
	forget(key string) error
	// source says where the secrets are kept.
	source() Source
}

// Source is where a secret comes from. Kind is env, keychain, credential-manager, secret-service
// or file; Env names the variable and Path the file.
type Source struct {
	Kind string `json:"kind"`
	Env  string `json:"env,omitempty"`
	Path string `json:"path,omitempty"`
}

// String is the source in people's words, for the vault's own command line.
func (s Source) String() string {
	return texts.Get("secret-from").Text(s.Kind, text.V{"Env": s.Env, "Path": s.Path})
}

// Value is a secret and where it comes from; Secret is empty when none is set.
type Value struct {
	Secret string
	From   Source
}

// Store is a program's declared secrets.
type Store struct {
	// Program files the secrets in the system's store (dev.piebird.<Program>), and names the
	// folder, under the person's config folder, of the file kept where there is no store.
	Program string
	Secrets []Secret
	// File, when set, keeps the secrets in that file instead of the system's store: for tests,
	// which must not touch the person's keychain.
	File string

	vault     vault
	vaultOnce sync.Once
}

// ForProgram is the store of the program name's secrets.
func ForProgram(name string, secrets []Secret) *Store {
	return &Store{Program: name, Secrets: secrets}
}

// keeper is the store's vault: File when set, else the system's secret store for the program,
// chosen on first use.
func (s *Store) keeper() (vault, error) {
	var err error
	s.vaultOnce.Do(func() {
		if s.File != "" {
			s.vault = fileVault{s.File}
			return
		}
		var dir string
		if dir, err = dirs.Config(s.Program); err == nil {
			s.vault = systemVault("dev.piebird."+s.Program, filepath.Join(dir, "secrets.json"))
		}
	})
	if s.vault == nil && err == nil {
		err = fmt.Errorf("no secret store for %s", s.Program)
	}
	return s.vault, err
}

// declared is the declaration of the secret key; one the program doesn't declare is its fault.
func (s *Store) declared(key string) (*Secret, error) {
	i := slices.IndexFunc(s.Secrets, func(d Secret) bool { return d.Key == key })
	if i < 0 {
		return nil, fmt.Errorf("%s declares no secret %q", s.Program, key)
	}
	return &s.Secrets[i], nil
}

// storeError is the store's failure doing something (read, save, forget) with the secret d: the
// declared error secret-store.
func storeError(doing string, d *Secret, kind string, cause error) error {
	return ops.FailWith("secret-store", cause, map[string]any{"doing": doing, "secret": d.Key, "store": kind})
}

// Get is the secret key: from its environment variable when that is set, else the one kept.
func (s *Store) Get(key string) (Value, error) {
	d, err := s.declared(key)
	if err != nil {
		return Value{}, err
	}
	if d.Env != "" {
		if v := strings.TrimSpace(os.Getenv(d.Env)); v != "" {
			return Value{v, Source{Kind: "env", Env: d.Env}}, nil
		}
	}
	v, err := s.keeper()
	if err != nil {
		return Value{}, storeError("read", d, "", err)
	}
	secret, ok, err := v.get(key)
	if err != nil {
		return Value{}, storeError("read", d, v.source().Kind, err)
	}
	if !ok {
		return Value{}, nil
	}
	return Value{secret, v.source()}, nil
}

// Set keeps value as the secret key and says where it went.
func (s *Store) Set(key, value string) (Source, error) {
	d, err := s.declared(key)
	if err != nil {
		return Source{}, err
	}
	v, err := s.keeper()
	if err != nil {
		return Source{}, storeError("save", d, "", err)
	}
	if err := v.set(key, s.Program+": "+d.Title, value); err != nil {
		return Source{}, storeError("save", d, v.source().Kind, err)
	}
	return v.source(), nil
}

// Forget removes the kept secret key; none kept is no error.
func (s *Store) Forget(key string) error {
	d, err := s.declared(key)
	if err != nil {
		return err
	}
	v, err := s.keeper()
	if err != nil {
		return storeError("forget", d, "", err)
	}
	if err := v.forget(key); err != nil {
		return storeError("forget", d, v.source().Kind, err)
	}
	return nil
}

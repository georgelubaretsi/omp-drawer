package secrets

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"piebird.dev/plugins/internal/ops"
)

const declared = `{
  "$schema": "../schemas/settings.schema.json",
  "settings": { "search": { "type": "choice", "default": "first" } },
  "secrets": {
    "token": { "title": "Demo token", "about": "The demo's token.", "env": "DEMO_TOKEN" },
    "api": { "title": "Demo API key", "about": "An API key.", "env": "" }
  }
}`

// withFile is a store of the declared secrets keeping them in a file of the test's own.
func withFile(t *testing.T) (*Store, string) {
	t.Helper()
	secrets, err := Load([]byte(declared))
	if err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(t.TempDir(), "config", "secrets.json")
	s := ForProgram("demo", secrets)
	s.File = file
	return s, file
}

func TestTheSecretsLoadSortedByKeyAndTheSettingsAreLeftAlone(t *testing.T) {
	secrets, err := Load([]byte(declared))
	if err != nil || len(secrets) != 2 || secrets[0].Key != "api" || secrets[1].Env != "DEMO_TOKEN" {
		t.Fatalf("%+v %v", secrets, err)
	}
	if _, err := Load([]byte(`{"secrets": {"token": {"title": "T", "where": "x"}}}`)); err == nil {
		t.Error("a secret's unknown field was taken")
	}
}

func TestASecretIsKeptReadAndForgotten(t *testing.T) {
	s, file := withFile(t)
	if got, err := s.Get("token"); err != nil || got != (Value{}) {
		t.Fatalf("none kept: %+v %v", got, err)
	}
	from, err := s.Set("token", "t0ken")
	if err != nil || from != (Source{Kind: "file", Path: file}) {
		t.Fatalf("kept in %+v: %v", from, err)
	}
	if got, err := s.Get("token"); err != nil || got != (Value{"t0ken", from}) {
		t.Fatalf("read back: %+v %v", got, err)
	}
	if err := s.Forget("token"); err != nil {
		t.Fatal(err)
	}
	if got, _ := s.Get("token"); got.Secret != "" {
		t.Fatalf("still there after forgetting: %+v", got)
	}
	if err := s.Forget("token"); err != nil {
		t.Fatalf("forgetting none: %v", err)
	}
}

func TestTheDeclaredEnvironmentVariableComesFirst(t *testing.T) {
	s, _ := withFile(t)
	if _, err := s.Set("token", "kept"); err != nil {
		t.Fatal(err)
	}
	t.Setenv("DEMO_TOKEN", " from-env ")
	got, err := s.Get("token")
	if err != nil || got != (Value{"from-env", Source{Kind: "env", Env: "DEMO_TOKEN"}}) {
		t.Fatalf("with DEMO_TOKEN set: %+v %v", got, err)
	}
	if !strings.Contains(got.From.String(), "DEMO_TOKEN") {
		t.Errorf("the source in words: %q", got.From.String())
	}
	t.Setenv("DEMO_TOKEN", "")
	if got, _ := s.Get("token"); got.Secret != "kept" {
		t.Fatalf("with DEMO_TOKEN empty: %+v", got)
	}
}

func TestOnlyDeclaredSecretsExist(t *testing.T) {
	s, _ := withFile(t)
	if _, err := s.Set("password", "x"); err == nil || !strings.Contains(err.Error(), `no secret "password"`) {
		t.Fatalf("an undeclared secret: %v", err)
	}
}

func TestAStoreThatFailsIsTheDeclaredErrorSecretStore(t *testing.T) {
	s, file := withFile(t)
	if err := os.MkdirAll(file, 0o700); err != nil { // a folder where the file goes
		t.Fatal(err)
	}
	_, err := s.Get("token")
	declared := new(ops.Error)
	if !errors.As(err, &declared) || declared.ID != "secret-store" || declared.Variables["doing"] != "read" ||
		declared.Variables["store"] != "file" || declared.Variables["cause"] == "" {
		t.Fatalf("got %v", err)
	}
}

func TestTheFileIsOnlyItsOwners(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Windows keeps no POSIX modes; it uses Credential Manager, not the file")
	}
	s, file := withFile(t)
	if _, err := s.Set("token", "t0ken"); err != nil {
		t.Fatal(err)
	}
	for path, want := range map[string]os.FileMode{file: 0o600, filepath.Dir(file): 0o700} {
		if info, err := os.Stat(path); err != nil || info.Mode().Perm() != want {
			t.Errorf("%s: %v %v, want %v", path, info.Mode().Perm(), err, want)
		}
	}
}

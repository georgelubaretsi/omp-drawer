package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"maps"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"testing"
	"time"

	"piebird.dev/plugins/internal/kagi"
	"piebird.dev/plugins/internal/kagi/kagitest"
	"piebird.dev/plugins/internal/secrets"
)

var update = flag.Bool("update", false, "rewrite testdata/replies/ from the vault's replies")

// goldenCall is one call in testdata/calls.json; Session is the session the vault keeps: Kagi's
// (the default), "stale" (one Kagi signed out) or "none".
type goldenCall struct {
	Name    string          `json:"name"`
	Op      string          `json:"op"`
	Input   json.RawMessage `json:"input"`
	Session string          `json:"session"`
}

// Things that change from run to run, shown as they would be on a person's computer.
var (
	signInPage  = regexp.MustCompile(`http://127\.0\.0\.1:\d+/[^"\\]+`)
	keptIn      = "/home/ada/.config/piebird/kagi-vault"
	pageAddress = "http://127.0.0.1:7777/0123abcd/"
)

// goldenVault is a vault on the fake Kagi with the session given, and no browser to open.
func goldenVault(t *testing.T, k *kagitest.Kagi, session string) *vault {
	t.Helper()
	store := secrets.ForProgram(program, []secrets.Secret{{Key: sessionKey, Title: "Kagi session"}})
	store.File = filepath.Join(t.TempDir(), "secrets.json")
	tokens := map[string]string{"": kagitest.Token, "stale": "stale-session-token-0123456789"}
	if tok, ok := tokens[session]; ok {
		if _, err := store.Set(sessionKey, tok); err != nil {
			t.Fatal(err)
		}
	}
	v := newVault(store, "/home/ada/.claude/plugins/piebird-kagi-search/native/"+program)
	v.newClient = func(tok string) *kagi.Client {
		c := kagi.New(tok, nil)
		c.Base, c.NewsBase = k.URL, k.URL
		return c
	}
	v.wait = time.Millisecond
	v.open = func(string) error { return errors.New("no browser on this computer") }
	return v
}

// The vault's reply to each call in testdata/calls.json, against a fake Kagi serving pages captured
// from Kagi: what the plugin's core turns into the model's text (its tests and the plugin's "what
// the model sees" page read these). `go test ./cmd/kagi-vault -run Golden -update` rewrites them.
func TestGoldenReplies(t *testing.T) {
	var calls []goldenCall
	data, err := os.ReadFile("testdata/calls.json")
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, &calls); err != nil {
		t.Fatal(err)
	}
	k := kagitest.Serve(t)
	for _, c := range calls {
		t.Run(c.Name, func(t *testing.T) {
			v := goldenVault(t, k, c.Session)
			got := reply(t, v, c.Op, string(c.Input))
			got = signInPage.ReplaceAllString(got, pageAddress)
			got = strings.ReplaceAll(got, filepath.Dir(v.store.File), keptIn)
			var pretty bytes.Buffer
			if err := json.Indent(&pretty, []byte(got), "", "  "); err != nil {
				t.Fatal(err)
			}
			compareGolden(t, filepath.Join("testdata", "replies", c.Name+".json"), pretty.String())
		})
	}
}

func compareGolden(t *testing.T, path, got string) {
	t.Helper()
	if *update {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(got), 0o644); err != nil { //nolint:gosec // a test's golden file, read by the plugin's tests
			t.Fatal(err)
		}
		return
	}
	want, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("%v (go test ./cmd/kagi-vault -run Golden -update writes it)", err)
	}
	if string(want) != got {
		t.Errorf("%s differs (-update rewrites it):\n%s", path, got)
	}
}

// The vault performs exactly the operations the plugin declares for it: core/operations.json's
// operations with `vault: true`.
func TestTheVaultPerformsTheDeclaredOperations(t *testing.T) {
	data, err := os.ReadFile("../../plugins/piebird-kagi-search/core/operations.json")
	if err != nil {
		t.Fatal(err)
	}
	var declared struct {
		Operations map[string]struct {
			Vault bool `json:"vault"`
		} `json:"operations"`
	}
	if err := json.Unmarshal(data, &declared); err != nil {
		t.Fatal(err)
	}
	var want []string
	for id, op := range declared.Operations {
		if op.Vault {
			want = append(want, id)
		}
	}
	slices.Sort(want)
	if got := slices.Sorted(maps.Keys(newVault(nil, "").ops())); !slices.Equal(got, want) {
		t.Errorf("the vault performs %v; operations.json gives it %v", got, want)
	}
}

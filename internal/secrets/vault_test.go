package secrets

import "testing"

// testService files the tests' secrets in a system store, apart from any program's.
const testService = "dev.piebird.settings-test"

// read is v's secret key and whether there is one, failing the test on an error.
func read(t *testing.T, v vault, key string) (string, bool) {
	t.Helper()
	secret, ok, err := v.get(key)
	if err != nil {
		t.Fatalf("get %s: %v", key, err)
	}
	return secret, ok
}

// must fails the test on err.
func must(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}

// conformance is what every vault does: nothing before a set, a set replaces, keys stay apart,
// forget removes and forgetting none is no error, and it says where it keeps them. It leaves
// nothing behind.
func conformance(t *testing.T, v vault) {
	t.Helper()
	if _, ok := read(t, v, "token"); ok {
		t.Fatal("a secret before any set")
	}
	for _, secret := range []string{"first-0123456789", "second, ünïcode, replacing it"} {
		must(t, v.set("token", "settings test: token", secret))
		if got, _ := read(t, v, "token"); got != secret {
			t.Fatalf("after set %q: %q", secret, got)
		}
	}
	must(t, v.set("other", "settings test: other", "kept apart"))
	must(t, v.forget("token"))
	if _, ok := read(t, v, "token"); ok {
		t.Fatal("still there after forget")
	}
	if got, _ := read(t, v, "other"); got != "kept apart" {
		t.Fatalf("the other key: %q", got)
	}
	must(t, v.forget("token"))
	must(t, v.forget("other"))
	if v.source().Kind == "" {
		t.Error("the vault names no kind of store")
	}
}

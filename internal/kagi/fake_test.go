package kagi

import (
	"net/http"
	"strings"
	"testing"

	"piebird.dev/plugins/internal/kagi/kagitest"
)

const goodToken = kagitest.Token

// fakeKagi is a client of a fake Kagi (kagitest) that serves the captured pages to goodToken.
func fakeKagi(t *testing.T) (*Client, *kagitest.Kagi) {
	t.Helper()
	k := kagitest.Serve(t)
	c := New(goodToken, http.Header{"User-Agent": {"test-agent"}, "Sec-Ch-Ua-Platform": {`"macOS"`}})
	c.Base, c.NewsBase = k.URL, k.URL
	return c, k
}

func mustContain(t *testing.T, got string, wants ...string) {
	t.Helper()
	for _, w := range wants {
		if !strings.Contains(got, w) {
			t.Errorf("missing %q in:\n%s", w, got)
		}
	}
}

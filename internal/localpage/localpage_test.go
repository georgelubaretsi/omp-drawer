package localpage

import (
	"io"
	"net"
	"net/http"
	"net/url"
	"testing"
	"time"

	"piebird.dev/plugins/internal/text"
	"piebird.dev/plugins/internal/text/texttest"
)

func serve(t *testing.T) *Server {
	t.Helper()
	s, err := Serve(func(w http.ResponseWriter, _ *http.Request) { _, _ = io.WriteString(w, "page") })
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(s.Close)
	return s
}

func get(t *testing.T, r *http.Request) (*http.Response, string) {
	t.Helper()
	resp, err := http.DefaultClient.Do(r)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = resp.Body.Close() }()
	b, _ := io.ReadAll(resp.Body)
	return resp, string(b)
}

func TestPageAnswersOnlyAtItsOwnAddress(t *testing.T) {
	s := serve(t)
	resp, body := get(t, httptestRequest(t, s.URL, ""))
	if resp.StatusCode != http.StatusOK || body != "page" || resp.Header.Get("Cache-Control") != "no-store" {
		t.Fatalf("own address: %d %q %v", resp.StatusCode, body, resp.Header)
	}
	parsed, _ := url.Parse(s.URL)
	for name, r := range map[string]*http.Request{
		"another host name": httptestRequest(t, s.URL, "attacker.example:"+parsed.Port()),
		"another path":      httptestRequest(t, "http://"+parsed.Host+"/", ""),
	} {
		if resp, _ := get(t, r); resp.StatusCode != http.StatusNotFound {
			t.Errorf("%s: status %d", name, resp.StatusCode)
		}
	}
}

func TestEachPageHasItsOwnAddress(t *testing.T) {
	if a, b := serve(t), serve(t); a.URL == b.URL {
		t.Fatalf("two pages share %s", a.URL)
	}
}

// A page ended by one of its own requests (Done, a pasted link) must still answer that request:
// the server stops while the handler is finishing.
func TestShutdownLetsTheRequestThatEndedThePageAnswer(t *testing.T) {
	ending := make(chan struct{})
	s, err := Serve(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, "ok")
		close(ending)
		time.Sleep(50 * time.Millisecond) // the handler still running as the server stops
	})
	if err != nil {
		t.Fatal(err)
	}
	go func() {
		<-ending
		s.Shutdown()
	}()
	resp, body := get(t, httptestRequest(t, s.URL, ""))
	if resp.StatusCode != http.StatusOK || body != "ok" {
		t.Fatalf("the ending request got %d %q", resp.StatusCode, body)
	}
}

// A browser opens connections ahead of time; one that never sends a request must not hold
// Shutdown for the 5 seconds net/http waits before it counts such a connection as idle.
func TestShutdownDoesNotWaitForUnusedConnections(t *testing.T) {
	s := serve(t)
	u, err := url.Parse(s.URL)
	if err != nil {
		t.Fatal(err)
	}
	c, err := net.Dial("tcp", u.Host)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = c.Close() }) // the server may have closed it already
	time.Sleep(50 * time.Millisecond)   // the server has accepted it
	start := time.Now()
	s.Shutdown()
	if took := time.Since(start); took > time.Second {
		t.Fatalf("Shutdown took %v with an unused connection open", took)
	}
}

// httptestRequest is a GET of u, sent with host as its Host header when given.
func httptestRequest(t *testing.T, u, host string) *http.Request {
	t.Helper()
	r, err := http.NewRequest(http.MethodGet, u, http.NoBody)
	if err != nil {
		t.Fatal(err)
	}
	if host != "" {
		r.Host = host
	}
	return r
}

func TestEveryTemplateHasACase(t *testing.T) {
	texttest.Every(t, texts, map[string]text.V{"errors/no-browser": nil})
}

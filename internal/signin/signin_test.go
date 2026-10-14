package signin

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"
)

func newFlow(t *testing.T) (f *Flow, opened *[]string, saved *string) {
	t.Helper()
	opened, saved = new([]string), new(string)
	f = New(Service{
		Name: "Demo", Credential: "Session Link", SourceURL: "https://demo.example/settings",
		Save: func(_ context.Context, value string) error {
			if value != "good" {
				return errors.New("Demo didn't accept that link")
			}
			*saved = value
			return nil
		},
	}, func(u string) error { *opened = append(*opened, u); return nil })
	t.Cleanup(f.Close)
	return f, opened, saved
}

func post(t *testing.T, u, value string) (status int, body string) {
	t.Helper()
	r, err := http.PostForm(u, url.Values{"value": {value}})
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = r.Body.Close() }()
	b, _ := io.ReadAll(r.Body)
	return r.StatusCode, string(b)
}

// started is a flow whose page is up, opened once in the stand-in browser.
func started(t *testing.T) (f *Flow, page string, saved *string) {
	t.Helper()
	f, opened, saved := newFlow(t)
	page, err := f.Start()
	if err != nil || len(*opened) != 1 || (*opened)[0] != page {
		t.Fatalf("Start: %q %v, opened %v", page, err, *opened)
	}
	return f, page, saved
}

func TestPageSendsThePersonToTheService(t *testing.T) {
	_, page, _ := started(t)
	r, err := http.Get(page)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(r.Body)
	_ = r.Body.Close()
	if !strings.Contains(string(body), "https://demo.example/settings") || !strings.Contains(string(body), "Connect Demo") {
		t.Errorf("page: %s", body)
	}
}

func TestRefusedValueKeepsTheSignInOpen(t *testing.T) {
	f, page, _ := started(t)
	if code, text := post(t, page, "bad"); code != http.StatusBadRequest || text != "Demo didn't accept that link" {
		t.Fatalf("bad value: %d %q", code, text)
	}
	if f.Wait(context.Background(), 10*time.Millisecond) {
		t.Error("a refused value finished the sign-in")
	}
}

func TestSavedValueEndsTheWaitAndRetiresThePage(t *testing.T) {
	f, page, saved := started(t)
	waited := make(chan bool)
	go func() { waited <- f.Wait(context.Background(), 5*time.Second) }()
	if code, text := post(t, page, "good"); code != http.StatusOK || text != "ok" {
		t.Fatalf("good value: %d %q", code, text)
	}
	if !<-waited || *saved != "good" {
		t.Fatal("Wait didn't see the saved value")
	}
	if next, _ := f.Start(); next == page {
		t.Error("a later sign-in reused the page's address")
	}
}

func TestStartOpensTheBrowserAtMostEvery30Seconds(t *testing.T) {
	f, opened, _ := newFlow(t)
	u1, _ := f.Start()
	u2, _ := f.Start()
	if u1 != u2 || len(*opened) != 1 {
		t.Fatalf("second Start: %q vs %q, opened %d times", u1, u2, len(*opened))
	}
}

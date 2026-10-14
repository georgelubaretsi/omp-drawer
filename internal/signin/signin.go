// Package signin signs a person in to a service that has no sign-in flow for programs: a one-page
// local website (localpage) opens in their browser, sends them to the service's own page to copy
// the credential, and takes it when they paste it. The credential goes from the browser to this
// process and on to Service.Save, never through the agent's chat.
package signin

import (
	"context"
	"embed"
	"html/template"
	"net/http"
	"sync"
	"time"

	"piebird.dev/plugins/internal/localpage"
)

// Service is what the page needs to know about the service.
type Service struct {
	// Name is the service's name, e.g. "Kagi".
	Name string
	// Credential is what the person copies, e.g. "Session Link".
	Credential string
	// SourceURL is the service's page showing the credential.
	SourceURL string
	// Save checks and stores a pasted value; its error is shown on the page as it is.
	Save func(ctx context.Context, value string) error
}

// reopenAfter is how long Start waits before opening the page in the browser again.
const reopenAfter = 30 * time.Second

//go:embed templates
var files embed.FS

// page is the sign-in page, an HTML template (its values escaped as HTML).
var page = template.Must(template.ParseFS(files, "templates/page.html"))

// Flow is one service's sign-in page, served while a sign-in is pending.
type Flow struct {
	svc    Service
	open   func(url string) error
	mu     sync.Mutex
	srv    *localpage.Server
	done   chan struct{}
	opened time.Time
}

// New makes the flow; open opens a URL in the person's browser (localpage.OpenBrowser, or a
// stand-in in tests).
func New(svc Service, open func(url string) error) *Flow {
	return &Flow{svc: svc, open: open, done: make(chan struct{})}
}

// Start serves the page if it isn't up and opens it in the browser, at most once every 30
// seconds. It returns the page's address; the error says only that the browser didn't open.
func (f *Flow) Start() (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.srv == nil {
		srv, err := localpage.Serve(f.handle)
		if err != nil {
			return "", err
		}
		f.srv, f.opened = srv, time.Time{}
	}
	if time.Since(f.opened) < reopenAfter {
		return f.srv.URL, nil
	}
	f.opened = time.Now()
	return f.srv.URL, f.open(f.srv.URL)
}

// Wait reports whether the credential was saved before ctx ended or d passed.
func (f *Flow) Wait(ctx context.Context, d time.Duration) bool {
	f.mu.Lock()
	done := f.done
	f.mu.Unlock()
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-done:
		return true
	case <-ctx.Done():
	case <-timer.C:
	}
	return false
}

// Close stops serving the page.
func (f *Flow) Close() {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.srv != nil {
		f.srv.Close()
		f.srv = nil
	}
}

func (f *Flow) handle(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_ = page.Execute(w, f.svc)
	case http.MethodPost:
		f.save(w, r)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (f *Flow) save(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 8<<10)
	value := r.PostFormValue("value")
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	if err := f.svc.Save(r.Context(), value); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(err.Error()))
		return
	}
	_, _ = w.Write([]byte("ok"))
	f.mu.Lock()
	close(f.done)
	f.done = make(chan struct{})
	srv := f.srv
	f.srv = nil
	f.mu.Unlock()
	// The page has its answer; the server goes once the reply is out.
	go srv.Shutdown()
}

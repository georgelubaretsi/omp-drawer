// Package localpage serves a page to the person at this computer: on 127.0.0.1, behind a random
// path, refusing any other host name or path (a site in their browser could otherwise reach it
// through a name it controls, DNS rebinding), and never cached. The sign-in page is one.
// OpenBrowser opens one in the person's browser.
package localpage

import (
	"context"
	"crypto/rand"
	"embed"
	"encoding/hex"
	"net"
	"net/http"
	"os/exec"
	"runtime"
	"sync"
	"time"

	"piebird.dev/plugins/internal/text"
)

//go:embed templates
var files embed.FS

var texts = text.Must(files, "templates")

// Server is one page being served.
type Server struct {
	// URL is the page's address, its secret path included.
	URL string
	srv *http.Server

	mu      sync.Mutex
	closing bool
	// unused holds connections that haven't sent a request: Shutdown counts them as idle only
	// after 5 seconds, and browsers open them ahead of time.
	unused map[net.Conn]struct{}
}

// Serve serves handle at a new address; handle sees only requests for the page's own host and path.
func Serve(handle http.HandlerFunc) (*Server, error) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, err
	}
	secret := make([]byte, 16)
	_, _ = rand.Read(secret) // never fails (crypto/rand)
	path := "/" + hex.EncodeToString(secret) + "/"
	host := ln.Addr().String()
	page := func(w http.ResponseWriter, r *http.Request) {
		if r.Host != host || r.URL.Path != path {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Referrer-Policy", "no-referrer")
		handle(w, r)
	}
	s := &Server{URL: "http://" + host + path, unused: map[net.Conn]struct{}{}}
	s.srv = &http.Server{Handler: http.HandlerFunc(page), ReadHeaderTimeout: 10 * time.Second, ConnState: s.track}
	go func() { _ = s.srv.Serve(ln) }()
	return s, nil
}

func (s *Server) track(c net.Conn, state http.ConnState) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if state != http.StateNew {
		delete(s.unused, c)
		return
	}
	if s.closing {
		_ = c.Close()
		return
	}
	s.unused[c] = struct{}{}
}

// Close stops serving the page at once, dropping replies still being written.
func (s *Server) Close() {
	_ = s.srv.Close()
}

// shutdownWait bounds how long Shutdown waits for replies still being written.
const shutdownWait = 5 * time.Second

// Shutdown stops serving the page once the replies being written are out, so the request that
// ended the page gets its answer. Call it outside the handler, which it waits for.
func (s *Server) Shutdown() {
	s.mu.Lock()
	s.closing = true
	for c := range s.unused {
		_ = c.Close()
	}
	s.mu.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), shutdownWait)
	defer cancel()
	if s.srv.Shutdown(ctx) != nil {
		_ = s.srv.Close()
	}
}

// ErrNoBrowser is OpenBrowser's error on a system it has no way to open a page on.
var ErrNoBrowser = texts.Get("errors/no-browser").Err(nil)

// OpenBrowser opens url in the default browser.
func OpenBrowser(url string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "linux", "freebsd", "openbsd", "netbsd":
		cmd = exec.Command("xdg-open", url)
	default:
		return ErrNoBrowser
	}
	if err := cmd.Start(); err != nil {
		return err
	}
	go func() { _ = cmd.Wait() }()
	return nil
}

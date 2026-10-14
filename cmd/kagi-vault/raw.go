package main

// Raw read and raw write pass a request to Kagi as the agent wrote it, for what the other
// operations don't cover: the one exception to named operations, scoped to kagi.com and
// news.kagi.com. raw-read takes a path or URL (GET), raw-write a whole request in HTTP's form
// (method and target, header lines, a blank line, the body). The guards: no redirect is followed;
// the session goes to kagi.com alone, never set by the request itself; a read never signs out; the
// answer never carries the session token, nor a cookie Kagi sets.

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"strings"

	"piebird.dev/plugins/internal/kagi"
	"piebird.dev/plugins/internal/ops"
	"piebird.dev/plugins/internal/results"
)

type rawInput struct {
	Request string `json:"request"`
}

// rawAnswer is Kagi's response; a body over keepUnder bytes goes to a file, and Saved says where.
type rawAnswer struct {
	kagi.Response
	Saved *results.Saved `json:"saved,omitempty"`
}

// keepUnder is the longest body the answer carries itself.
const keepUnder = 32 << 10

func (v *vault) rawRead(ctx context.Context, in *rawInput) (rawAnswer, error) {
	req, err := readRequest(in.Request)
	if err != nil {
		return rawAnswer{}, err
	}
	return v.raw(ctx, req)
}

func (v *vault) rawWrite(ctx context.Context, in *rawInput) (rawAnswer, error) {
	req, err := writeRequest(in.Request)
	if err != nil {
		return rawAnswer{}, err
	}
	return v.raw(ctx, req)
}

func (v *vault) raw(ctx context.Context, req kagi.Request) (rawAnswer, error) {
	c, err := v.kagi()
	if err != nil {
		return rawAnswer{}, err
	}
	r, err := c.Raw(ctx, req)
	if err != nil {
		return rawAnswer{}, err
	}
	r.Body, r.Location = redact(r.Body, c.Token), redact(r.Location, c.Token)
	if len(r.Body) <= keepUnder {
		return rawAnswer{Response: r}, nil
	}
	store, err := results.ForProgram(program)
	if err != nil {
		return rawAnswer{}, err
	}
	saved, err := store.Save([]byte(r.Body), r.ContentType)
	if err != nil {
		return rawAnswer{}, err
	}
	r.Body = ""
	return rawAnswer{Response: r, Saved: &saved}, nil
}

// redact takes the session token out of s, as written and as URL-encoded, so no answer carries it.
func redact(s, token string) string {
	if token == "" {
		return s
	}
	for _, form := range []string{token, url.QueryEscape(token), url.PathEscape(token)} {
		s = strings.ReplaceAll(s, form, "")
	}
	return s
}

// method is the shape of an HTTP method at the start of a request.
var method = regexp.MustCompile(`^[A-Z]+$`)

// signOut matches the paths that end the session, which a read leaves alone.
var signOut = regexp.MustCompile(`(?i)(log|sign)[-_]?out`)

// signsOut is whether target's path ends the session as Kagi reads it: percent-decoded and with
// its dot segments resolved, so `/%6Cogout` and `/x/../logout` count. A target that isn't a URL
// is matched as written; resolve refuses it before anything goes.
func signsOut(target string) bool {
	raw := strings.SplitN(target, "?", 2)[0]
	if strings.HasPrefix(target, "/") {
		target = "https://kagi.com" + target
	}
	u, err := url.Parse(target)
	if err != nil {
		return signOut.MatchString(raw)
	}
	return signOut.MatchString(raw) || signOut.MatchString(path.Clean("/"+u.Path))
}

// readRequest is a raw read: a path or URL, optionally after GET.
func readRequest(s string) (kagi.Request, error) {
	s = strings.TrimSpace(s)
	if m, rest, ok := strings.Cut(s, " "); ok && method.MatchString(m) {
		if m != http.MethodGet {
			return kagi.Request{}, ops.Fail("raw-read-method", map[string]any{"method": m})
		}
		s = strings.TrimSpace(rest)
	}
	switch {
	case s == "" || strings.ContainsAny(s, " \n"):
		return kagi.Request{}, ops.Fail("raw-read-target", nil)
	case signsOut(s):
		return kagi.Request{}, ops.Fail("raw-read-sign-out", nil)
	}
	return kagi.Request{Method: http.MethodGet, Target: s}, nil
}

// writeRequest is a whole request in HTTP's form: the method and target, header lines, a blank
// line and the body. Only the head is tidied (leading space, CRLF or LF); the body goes as given.
func writeRequest(s string) (kagi.Request, error) {
	head, body := splitRequest(strings.TrimLeft(s, " \t\r\n"))
	lines := strings.Split(head, "\n")
	m, target, ok := strings.Cut(strings.TrimSpace(lines[0]), " ")
	if !ok || !method.MatchString(m) {
		return kagi.Request{}, ops.Fail("raw-write-start", nil)
	}
	target = strings.TrimSpace(target)
	if i := strings.LastIndex(target, " HTTP/"); i > 0 {
		target = target[:i]
	}
	header := http.Header{}
	for _, l := range lines[1:] {
		l = strings.TrimSuffix(l, "\r")
		if strings.TrimSpace(l) == "" {
			continue
		}
		k, val, ok := strings.Cut(l, ":")
		if !ok {
			return kagi.Request{}, ops.Fail("raw-write-header", map[string]any{"line": l})
		}
		header.Add(strings.TrimSpace(k), strings.TrimSpace(val))
	}
	if header.Get("Cookie") != "" || header.Get("Host") != "" {
		return kagi.Request{}, ops.Fail("raw-write-cookie", nil)
	}
	if body != "" && header.Get("Content-Type") == "" {
		header.Set("Content-Type", "application/x-www-form-urlencoded")
		if json.Valid([]byte(body)) {
			header.Set("Content-Type", "application/json")
		}
	}
	return kagi.Request{Method: m, Target: target, Header: header, Body: body}, nil
}

// splitRequest cuts a request at its first blank line, CRLF or LF; without one it is all head.
func splitRequest(s string) (head, body string) {
	i, n := strings.Index(s, "\r\n\r\n"), 4
	if j := strings.Index(s, "\n\n"); j >= 0 && (i < 0 || j < i) {
		i, n = j, 2
	}
	if i < 0 {
		return strings.TrimRight(s, " \t\r\n"), ""
	}
	return s[:i], s[i+n:]
}

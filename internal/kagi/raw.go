package kagi

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
)

// Request is a request to Kagi as an agent wrote it: for what the other calls don't cover.
type Request struct {
	Method string
	// Target is a path on kagi.com (/html/search?q=x) or an https URL on kagi.com or news.kagi.com.
	Target string
	Header http.Header
	Body   string
}

// Response is what Kagi sent back to a Request, untouched.
type Response struct {
	URL         string `json:"url"`
	Status      int    `json:"status"`
	ContentType string `json:"content_type,omitempty"`
	// Location is where a redirect points (a signed-out session gets one to the sign-in page).
	Location string `json:"location,omitempty"`
	Body     string `json:"body"`
	// Truncated says Body stops at MaxRaw bytes.
	Truncated bool `json:"truncated,omitempty"`
}

// MaxRaw bounds the body Raw returns.
const MaxRaw = 4 << 20

// Raw sends r as it is, with the session when it goes to kagi.com (never to another host), and
// returns the response as it came, redirects unfollowed.
func (c *Client) Raw(ctx context.Context, r Request) (Response, error) {
	u, base, err := c.resolve(r.Target)
	if err != nil {
		return Response{}, err
	}
	var body io.Reader = http.NoBody
	if r.Body != "" {
		body = strings.NewReader(r.Body)
	}
	req, err := http.NewRequestWithContext(ctx, r.Method, base+u.RequestURI(), body)
	if err != nil {
		return Response{}, err
	}
	for k, v := range c.Headers {
		req.Header[k] = v
	}
	for k, v := range r.Header {
		req.Header[k] = v
	}
	if base == c.Base && c.Token != "" {
		req.AddCookie(&http.Cookie{Name: "kagi_session", Value: c.Token})
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return Response{}, failWith("cannot-reach", err, nil)
	}
	defer func() { _ = resp.Body.Close() }()
	buf := make([]byte, MaxRaw+1)
	n, err := io.ReadFull(resp.Body, buf)
	if err != nil && !errors.Is(err, io.ErrUnexpectedEOF) && !errors.Is(err, io.EOF) {
		return Response{}, failReading("answer", err)
	}
	return Response{
		URL: u.String(), Status: resp.StatusCode, ContentType: resp.Header.Get("Content-Type"),
		Location: resp.Header.Get("Location"), Body: string(buf[:min(n, MaxRaw)]), Truncated: n > MaxRaw,
	}, nil
}

// resolve reads target as a URL on kagi.com or news.kagi.com and returns it with the base it goes
// to (the real host, or the client's stand-in for it in tests).
func (c *Client) resolve(target string) (*url.URL, string, error) {
	target = strings.TrimSpace(target)
	if strings.HasPrefix(target, "/") {
		target = "https://kagi.com" + target
	}
	u, err := url.Parse(target)
	if err != nil || u.Scheme != "https" {
		return nil, "", fail("target", nil)
	}
	switch u.Host {
	case "kagi.com":
		return u, c.Base, nil
	case "news.kagi.com":
		return u, c.NewsBase, nil
	}
	return nil, "", fail("host", map[string]any{"host": u.Host})
}

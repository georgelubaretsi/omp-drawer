package kagi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// rawKagi is a client whose kagi.com and news.kagi.com are fakes recording each request's cookie.
func rawKagi(t *testing.T) (c *Client, cookies map[string]string) {
	t.Helper()
	cookies = map[string]string{}
	serve := func(host string) *httptest.Server {
		return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookies[host] = r.Header.Get("Cookie")
			switch r.URL.Path {
			case "/away":
				http.Redirect(w, r, "/signin", http.StatusFound)
			case "/big":
				_, _ = w.Write([]byte(strings.Repeat("x", MaxRaw+10)))
			default:
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`{"method":"` + r.Method + `","accept":"` + r.Header.Get("Accept") + `"}`))
			}
		}))
	}
	web, news := serve("kagi.com"), serve("news.kagi.com")
	t.Cleanup(web.Close)
	t.Cleanup(news.Close)
	c = New("tok", http.Header{"Accept": {"text/html"}})
	c.Base, c.NewsBase = web.URL, news.URL
	return c, cookies
}

func TestRawSendsTheSessionToKagiAlone(t *testing.T) {
	c, cookies := rawKagi(t)
	r, err := c.Raw(ctx, Request{Method: "POST", Target: "/x", Header: http.Header{"Accept": {"application/json"}}, Body: "a=1"})
	if err != nil || r.Status != 200 || r.Body != `{"method":"POST","accept":"application/json"}` || r.ContentType != "application/json" {
		t.Fatalf("kagi.com: %+v %v", r, err)
	}
	if _, err := c.Raw(ctx, Request{Method: "GET", Target: "https://news.kagi.com/api/x"}); err != nil {
		t.Fatal(err)
	}
	if cookies["kagi.com"] != "kagi_session=tok" || cookies["news.kagi.com"] != "" {
		t.Errorf("cookies sent: %v", cookies)
	}
	for _, target := range []string{"https://evil.com/x", "http://kagi.com/x", "ftp://kagi.com/"} {
		if _, err := c.Raw(ctx, Request{Method: "GET", Target: target}); err == nil {
			t.Errorf("%s: sent", target)
		}
	}
}

func TestRawKeepsRedirectsAndCutsLongBodies(t *testing.T) {
	c, _ := rawKagi(t)
	r, err := c.Raw(ctx, Request{Method: "GET", Target: "/away"})
	if err != nil || r.Status != http.StatusFound || r.Location != "/signin" {
		t.Errorf("redirect: %+v %v", r, err)
	}
	r, err = c.Raw(ctx, Request{Method: "GET", Target: "/big"})
	if err != nil || len(r.Body) != MaxRaw || !r.Truncated {
		t.Errorf("long body: %d bytes, truncated %v, %v", len(r.Body), r.Truncated, err)
	}
}

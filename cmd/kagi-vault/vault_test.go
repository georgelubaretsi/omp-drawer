package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"piebird.dev/plugins/internal/kagi"
	"piebird.dev/plugins/internal/secrets"
)

const token = "valid-session-0123456789"

// testVault is a vault whose Kagi is a fake that knows one session, whose secrets go to a file of
// the test's own, and whose "browser" pastes the Session Link into the sign-in page when paste is
// true. The fake echoes the cookie it got and the token in a page, for the guards to remove.
func testVault(t *testing.T, paste bool) (v *vault, searches *int) {
	t.Helper()
	searches = new(int)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if c, err := r.Cookie("kagi_session"); err != nil || c.Value != token {
			http.Redirect(w, r, "/signin", http.StatusFound)
			return
		}
		switch r.URL.Path {
		case "/html/search":
			*searches++
			_, _ = w.Write([]byte(`<div class="search-result"><a class="__sri_title_link" href="https://example.com/">Example</a></div>`))
		case "/echo":
			http.SetCookie(w, &http.Cookie{Name: "kagi_session", Value: token})
			w.Header().Set("Location", "/search?token="+url.QueryEscape(token))
			_, _ = w.Write([]byte("your token is " + token + " and " + url.QueryEscape(token+"/")))
		case "/big":
			_, _ = w.Write([]byte(strings.Repeat("line of a long page\n", 4000)))
		default:
			_, _ = w.Write([]byte("<html>home</html>"))
		}
	}))
	t.Cleanup(srv.Close)
	store := secrets.ForProgram(program, []secrets.Secret{{Key: sessionKey, Title: "Kagi session"}})
	store.File = filepath.Join(t.TempDir(), "secrets.json")
	v = newVault(store, "/plugin/native/"+program)
	v.newClient = func(tok string) *kagi.Client {
		c := kagi.New(tok, nil)
		c.Base = srv.URL
		return c
	}
	v.wait = 2 * time.Second
	v.open = func(page string) error {
		if paste {
			go func() { _, _ = http.PostForm(page, url.Values{"value": {"https://kagi.com/search?token=" + token}}) }()
		}
		return nil
	}
	return v, searches
}

// reply is the vault's reply to `call name` with input, as it wrote it.
func reply(t *testing.T, v *vault, name, input string) string {
	t.Helper()
	var out bytes.Buffer
	if code := run(context.Background(), v, []string{"call", name}, stdio{strings.NewReader(input), &out}); code != 0 {
		t.Fatalf("call %s: exit %d", name, code)
	}
	return out.String()
}

// call is the vault's reply to `call name` with input, decoded.
func call(t *testing.T, v *vault, name, input string) map[string]any {
	t.Helper()
	var decoded map[string]any
	if err := json.Unmarshal([]byte(reply(t, v, name, input)), &decoded); err != nil {
		t.Fatalf("call %s: the reply isn't JSON: %v", name, err)
	}
	return decoded
}

func TestTheFirstSearchSignsInThenAnswers(t *testing.T) {
	v, searches := testVault(t, true)
	reply := call(t, v, "search", `{"query":"example"}`)
	results, _ := reply["output"].(map[string]any)["results"].([]any)
	if len(results) != 1 || *searches != 1 {
		t.Fatalf("search: %v, %d searches", reply, *searches)
	}
	if s, _ := v.store.Get(sessionKey); s.Secret != token {
		t.Errorf("the session wasn't kept: %+v", s)
	}
	status := call(t, v, "status", `{}`)["output"].(map[string]any)
	if status["signed_in"] != true || status["from"].(map[string]any)["kind"] != "file" {
		t.Errorf("status: %v", status)
	}
}

func TestASearchWithoutASignInSaysHowAsADeclaredError(t *testing.T) {
	v, _ := testVault(t, false)
	v.wait = 50 * time.Millisecond
	reply := call(t, v, "search", `{"query":"example"}`)
	e, _ := reply["error"].(map[string]any)
	vars, _ := e["variables"].(map[string]any)
	if e["id"] != "sign-in-needed" || vars["why"] != "no-session" || vars["opened"] != "yes" ||
		!strings.HasPrefix(vars["page"].(string), "http://127.0.0.1:") || vars["vault"] != "/plugin/native/"+program {
		t.Fatalf("got %v", reply)
	}
}

func TestInputsAreCheckedHere(t *testing.T) {
	v, _ := testVault(t, false)
	for input, id := range map[string]string{
		`{"queries":[]}`:                     "queries",
		`{"queries":["a"],"limit":51}`:       "limit",
		`{"queries":["a"],"time":"century"}`: "one-of",
		`{"queries":["a"],"colour":"red"}`:   "bad-input",
	} {
		e, _ := call(t, v, "batch-search", input)["error"].(map[string]any)
		if e["id"] != id {
			t.Errorf("%s: got %v, want %s", input, e, id)
		}
	}
	if e, _ := call(t, v, "smallweb", `{"limit":0.5}`)["error"].(map[string]any); e["id"] != "bad-input" {
		t.Errorf("a limit that isn't a whole number: %v", e)
	}
}

func TestRawAnswersNeverCarryTheSession(t *testing.T) {
	v, _ := testVault(t, false)
	if _, err := v.store.Set(sessionKey, token); err != nil {
		t.Fatal(err)
	}
	whole := reply(t, v, "raw-read", `{"request":"/echo"}`)
	out, _ := call(t, v, "raw-read", `{"request":"/echo"}`)["output"].(map[string]any)
	if out["status"] != float64(200) || strings.Contains(whole, token) || strings.Contains(whole, url.QueryEscape(token)) ||
		strings.Contains(strings.ToLower(whole), "set-cookie") {
		t.Fatalf("got %s", whole)
	}
	if !strings.Contains(out["body"].(string), "your token is ") {
		t.Errorf("the body went: %v", out)
	}
}

func TestALongRawBodyGoesToAFile(t *testing.T) {
	v, _ := testVault(t, false)
	t.Setenv("XDG_CACHE_HOME", t.TempDir())
	t.Setenv("HOME", t.TempDir())
	if _, err := v.store.Set(sessionKey, token); err != nil {
		t.Fatal(err)
	}
	out, _ := call(t, v, "raw-read", `{"request":"/big"}`)["output"].(map[string]any)
	saved, _ := out["saved"].(map[string]any)
	if out["body"] != "" || saved == nil || saved["bytes"] != float64(4000*20) || !strings.HasPrefix(saved["preview"].(string), "line of a long page") {
		t.Fatalf("got %v", out)
	}
}

func TestRawRequestsAreRefusedBeforeTheyGo(t *testing.T) {
	v, _ := testVault(t, false)
	for op, cases := range map[string]map[string]string{
		"raw-read": {
			"POST /html/search":           "raw-read-method",
			"/html/search?q=a b":          "raw-read-target",
			"/logout":                     "raw-read-sign-out",
			"/%6Cogout":                   "raw-read-sign-out",
			"/%6c%6fG%4fUT?x=1":           "raw-read-sign-out",
			"/settings/../logout":         "raw-read-sign-out",
			"https://kagi.com/%73ign_out": "raw-read-sign-out",
			"https://evil.example/steal":  "host",
			"http://kagi.com/":            "target",
		},
		"raw-write": {
			"post /x":                             "raw-write-start",
			"POST /x\nno colon here":              "raw-write-header",
			"POST /x\nCookie: kagi_session=other": "raw-write-cookie",
			"POST https://evil.example/x\n\nbody": "host",
		},
	} {
		for request, id := range cases {
			input := `{"request":` + strconv.Quote(request) + `}`
			if e, _ := call(t, v, op, input)["error"].(map[string]any); e["id"] != id {
				t.Errorf("%s %q: got %v, want %s", op, request, e, id)
			}
		}
	}
}

func TestAnUnknownOperationIsAUsageError(t *testing.T) {
	v, _ := testVault(t, false)
	var out bytes.Buffer
	if code := run(context.Background(), v, []string{"call", "fly"}, stdio{strings.NewReader("{}"), &out}); code != 2 || out.Len() != 0 {
		t.Errorf("exit %d, out %q", code, out.String())
	}
}

// personAt runs argv on v with stdin typed in: the Session Link, pasted when sign-in --link asks.
func personAt(v *vault) func(stdin string, argv ...string) (int, string) {
	return func(stdin string, argv ...string) (int, string) {
		var out bytes.Buffer
		code := run(context.Background(), v, argv, stdio{strings.NewReader(stdin), &out})
		return code, out.String()
	}
}

func TestAPersonSignsInWithTheLinkSeesTheStatusAndSignsOut(t *testing.T) {
	v, _ := testVault(t, false)
	person := personAt(v)
	if code, out := person("https://kagi.com/search?token=nope-not-the-session-0\n", "sign-in", "--link"); code != 1 || out != "" {
		t.Errorf("a refused link: %d %q", code, out)
	}
	if code, out := person("https://kagi.com/search?token="+token+"\n", "sign-in", "--link"); code != 0 || !strings.HasPrefix(out, "Signed in to Kagi") {
		t.Errorf("sign-in: %d %q", code, out)
	}
	if code, out := person("", "status"); code != 0 || !strings.HasPrefix(out, "Signed in to Kagi; the session comes from") {
		t.Errorf("status: %d %q", code, out)
	}
	if code, out := person("", "sign-out"); code != 0 || !strings.HasPrefix(out, "Signed out") {
		t.Errorf("sign-out: %d %q", code, out)
	}
	if code, out := person("", "status"); code != 0 || !strings.HasPrefix(out, "Not signed in") {
		t.Errorf("status after sign-out: %d %q", code, out)
	}
}

func TestSignInTakesTheLinkOnlyOnStandardInput(t *testing.T) {
	v, _ := testVault(t, false)
	person := personAt(v)
	if code, _ := person("", "sign-in", "extra"); code != 2 {
		t.Errorf("a word sign-in doesn't take: %d", code)
	}
	if code, _ := person("", "sign-in", "--link"); code != 2 {
		t.Errorf("--link with nothing pasted: %d", code)
	}
	if code, _ := person("", "sign-in", "--link", "https://kagi.com/search?token="+token); code != 2 {
		t.Errorf("a link on the command line: %d", code)
	}
}

package main

import (
	"context"
	"errors"
	"sync"
	"time"

	"piebird.dev/plugins/internal/chrome"
	"piebird.dev/plugins/internal/kagi"
	"piebird.dev/plugins/internal/localpage"
	"piebird.dev/plugins/internal/ops"
	"piebird.dev/plugins/internal/secrets"
	"piebird.dev/plugins/internal/signin"
)

// sessionKey is the session's key in the declared secrets (core/settings.json): the token of the
// person's Kagi Session Link, KAGI_SESSION_TOKEN when that is set.
const sessionKey = "session"

// vault is one run's Kagi: the session in use, the sign-in page when one is needed, and the store
// the session is kept in.
type vault struct {
	store *secrets.Store
	// self is this program's path, for the command a sign-in error gives.
	self string
	open func(url string) error
	// wait is how long a call waits for the person to sign in on the page.
	wait   time.Duration
	mu     sync.Mutex
	client *kagi.Client
	from   secrets.Source
	flow   *signin.Flow
	// newClient makes the client for a token; tests point it at a fake Kagi.
	newClient func(token string) *kagi.Client
}

func newVault(store *secrets.Store, self string) *vault {
	v := &vault{store: store, self: self, open: localpage.OpenBrowser, wait: 45 * time.Second}
	v.newClient = func(token string) *kagi.Client { return kagi.New(token, chrome.Headers()) }
	return v
}

// kagi is the client for the current session, loading it on first use.
func (v *vault) kagi() (*kagi.Client, error) {
	v.mu.Lock()
	defer v.mu.Unlock()
	if v.client != nil {
		return v.client, nil
	}
	s, err := v.store.Get(sessionKey)
	if err != nil {
		return nil, err
	}
	v.client, v.from = v.newClient(s.Secret), s.From
	return v.client, nil
}

// public is a client for Kagi's public parts, which need no session: the session's when one loads.
func (v *vault) public() *kagi.Client {
	if c, err := v.kagi(); err == nil {
		return c
	}
	return v.newClient("")
}

// reload reads the session again, and reports whether it changed (signed in elsewhere since).
func (v *vault) reload() bool {
	v.mu.Lock()
	defer v.mu.Unlock()
	s, err := v.store.Get(sessionKey)
	if err != nil || v.client != nil && s.Secret == v.client.Token {
		return false
	}
	v.client, v.from = v.newClient(s.Secret), s.From
	return true
}

// signedIn checks a pasted Session Link with Kagi, keeps it and uses it from now on.
func (v *vault) signedIn(ctx context.Context, pasted string) error {
	token, err := kagi.ParseLink(pasted)
	if err != nil {
		return err
	}
	c := v.newClient(token)
	if err := c.SignedIn(ctx); err != nil {
		if errors.Is(err, kagi.ErrSignIn) {
			return ops.Fail("link-refused", nil)
		}
		return err
	}
	from, err := v.store.Set(sessionKey, token)
	if err != nil {
		return err
	}
	v.mu.Lock()
	v.client, v.from = c, from
	v.mu.Unlock()
	return nil
}

// signOut forgets the kept session, and stops using it.
func (v *vault) signOut() error {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.client = nil
	return v.store.Forget(sessionKey)
}

// signInFlow is the sign-in page, made on first use; what it shows a person is in their words
// (people.go).
func (v *vault) signInFlow() *signin.Flow {
	v.mu.Lock()
	defer v.mu.Unlock()
	if v.flow == nil {
		v.flow = signin.New(signin.Service{
			Name: says("service"), Credential: says("credential"),
			SourceURL: "https://kagi.com/settings/user_details",
			Save:      func(ctx context.Context, pasted string) error { return forPeople(v.signedIn(ctx, pasted)) },
		}, v.open)
	}
	return v.flow
}

// withSession calls fn with the session's client. When Kagi wants a sign-in, it reads the session
// again (another run may have signed in), else it opens the sign-in page in the person's browser,
// waits for them a while, and calls fn again once they're signed in. A session from the
// environment gets no page: the variable comes before a kept session, so a sign-in can't help.
func withSession[R any](ctx context.Context, v *vault, fn func(*kagi.Client) (R, error)) (R, error) {
	var none R
	c, err := v.kagi()
	if err != nil {
		return none, err
	}
	out, err := fn(c)
	if !errors.Is(err, kagi.ErrSignIn) {
		return out, err
	}
	if v.reload() {
		if c, err = v.kagi(); err == nil {
			out, err = fn(c)
		}
		if !errors.Is(err, kagi.ErrSignIn) {
			return out, err
		}
	}
	if env := v.envSource(); env != "" {
		return none, ops.Fail("env-session-refused", map[string]any{"env": env})
	}
	flow := v.signInFlow()
	defer flow.Close()
	url, openErr := flow.Start()
	if url != "" && flow.Wait(ctx, v.wait) {
		if c, err = v.kagi(); err == nil {
			return fn(c)
		}
		return none, err
	}
	return none, v.signInNeeded(err, url, openErr)
}

// envSource is the environment variable the session in use comes from; empty when it is kept.
func (v *vault) envSource() string {
	v.mu.Lock()
	defer v.mu.Unlock()
	if v.from.Kind != "env" {
		return ""
	}
	return v.from.Env
}

// signInNeeded is the declared error sign-in-needed: why (no-session or signed-out), and how the
// person signs in: the page's address and whether it opened, or the command with the link.
func (v *vault) signInNeeded(cause error, url string, openErr error) error {
	why := "no-session"
	if declared := new(ops.Error); errors.As(cause, &declared) {
		why = declared.ID
	}
	vars := map[string]any{"why": why, "page": url, "opened": "yes", "vault": v.self}
	switch {
	case url == "":
		vars["opened"] = "no-page"
		vars["problem"] = openErr.Error()
	case openErr != nil:
		vars["opened"] = "no"
		vars["problem"] = openErr.Error()
	}
	return ops.Fail("sign-in-needed", vars)
}

// status is whether a session is kept, where, and whether Kagi accepts it; never the token.
type status struct {
	SignedIn bool            `json:"signed_in"`
	From     *secrets.Source `json:"from,omitempty"`
	// Problem is why Kagi refused the session it has: a declared error's id and values.
	Problem *problem `json:"problem,omitempty"`
}

type problem struct {
	ID        string         `json:"id"`
	Variables map[string]any `json:"variables"`
}

func (v *vault) status(ctx context.Context) (status, error) {
	c, err := v.kagi()
	if err != nil {
		return status{}, err
	}
	if c.Token == "" {
		return status{}, nil
	}
	v.mu.Lock()
	from := v.from
	v.mu.Unlock()
	if err := c.SignedIn(ctx); err != nil {
		declared := new(ops.Error)
		if !errors.As(err, &declared) {
			return status{}, err
		}
		// A session Kagi refuses is the status, not a failure.
		return status{From: &from, Problem: &problem{declared.ID, declared.Variables}}, nil
	}
	return status{SignedIn: true, From: &from}, nil
}

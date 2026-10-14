package kagi

import (
	"errors"
	"strings"

	"piebird.dev/plugins/internal/ops"
)

// The client's errors are declared ones (package ops): an id with its values, which the plugin's
// core/model.ftl puts in words.

// ErrSignIn marks a failure a sign-in fixes: no session saved, or Kagi refused it.
var ErrSignIn = errors.New("sign in to Kagi")

// signInError is a failure a sign-in fixes, saying why: no-session or signed-out.
type signInError struct{ declared *ops.Error }

func signIn(why string) error             { return &signInError{ops.Fail(why, nil)} }
func (e *signInError) Error() string      { return e.declared.Error() }
func (e *signInError) Unwrap() error      { return e.declared }
func (*signInError) Is(target error) bool { return target == ErrSignIn }

// fail is the declared error id, with the values v.
func fail(id string, v map[string]any) error { return ops.Fail(id, v) }

// failWith is fail with what went wrong beneath it as its cause.
func failWith(id string, cause error, v map[string]any) error { return ops.FailWith(id, cause, v) }

// failReading is the error of a part of Kagi's answer that couldn't be read: what is answer,
// results, news, news-page or smallweb.
func failReading(what string, cause error) error {
	return ops.FailWith("reading", cause, map[string]any{"what": what})
}

// oneOf is the error of an argument name that is none of values.
func oneOf(name string, values []string, got string) error {
	return fail("one-of", map[string]any{"name": name, "values": strings.Join(values, ", "), "got": got})
}

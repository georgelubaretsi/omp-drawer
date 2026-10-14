// Package ops is a vault's protocol for its named operations (kit/core/vault.ts): `<vault> call
// <operation>`, the operation's input as JSON on stdin, and on stdout one JSON object,
// {"output": ...} or {"error": {"id": ..., "variables": {...}}}, with exit status 0 for both. An
// error's id is one the operation declares in its plugin's core/operations.json; the words for it
// are in the plugin's core/model.ftl, never here, and its variables are data: strings and numbers.
package ops

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"maps"
	"slices"
	"strings"
)

// Error is a declared error: its id and the values its text takes.
type Error struct {
	ID        string
	Variables map[string]any
}

// Error is the id and the values, for logs and tests; the model reads the catalog's words.
func (e *Error) Error() string {
	if len(e.Variables) == 0 {
		return e.ID
	}
	parts := make([]string, 0, len(e.Variables))
	for _, k := range slices.Sorted(maps.Keys(e.Variables)) {
		parts = append(parts, fmt.Sprintf("%s=%v", k, e.Variables[k]))
	}
	return e.ID + " (" + strings.Join(parts, ", ") + ")"
}

// Fail is the declared error id, with the values v.
func Fail(id string, v map[string]any) *Error {
	if v == nil {
		v = map[string]any{}
	}
	return &Error{ID: id, Variables: v}
}

// FailWith is the declared error id with what went wrong beneath it as its "cause".
func FailWith(id string, cause error, v map[string]any) *Error {
	e := Fail(id, maps.Clone(v))
	if e.Variables == nil {
		e.Variables = map[string]any{}
	}
	e.Variables["cause"] = cause.Error()
	return e
}

// Failed is the id every operation declares for a failure no other id names: its cause is the
// failure's own text.
const Failed = "failed"

// Op performs one operation on its input, as sent.
type Op func(ctx context.Context, input json.RawMessage) (any, error)

// Decode reads the input into v. A field v doesn't have, or a value of the wrong kind, is the
// declared error "bad-input".
func Decode(input json.RawMessage, v any) error {
	if len(bytes.TrimSpace(input)) == 0 {
		input = json.RawMessage("{}")
	}
	d := json.NewDecoder(bytes.NewReader(input))
	d.DisallowUnknownFields()
	if err := d.Decode(v); err != nil {
		return FailWith("bad-input", err, nil)
	}
	return nil
}

type reply struct {
	Output any         `json:"output,omitempty"`
	Error  *replyError `json:"error,omitempty"`
}

type replyError struct {
	ID        string         `json:"id"`
	Variables map[string]any `json:"variables"`
}

// ErrUnknown is an operation the vault doesn't have: a usage error, not a reply.
var ErrUnknown = errors.New("no such operation")

// Find is the operation name of ops, or ErrUnknown naming the ones there are.
func Find(ops map[string]Op, name string) (Op, error) {
	op, ok := ops[name]
	if !ok {
		return nil, fmt.Errorf("%w %q; the operations: %s", ErrUnknown, name, strings.Join(slices.Sorted(maps.Keys(ops)), ", "))
	}
	return op, nil
}

// Call performs op on the input read from in and writes its reply to out. An operation's error
// that is no declared one is replied as Failed. It returns an error only when the reply can't be
// written.
func Call(ctx context.Context, op Op, in io.Reader, out io.Writer) error {
	input, err := io.ReadAll(in)
	var output any
	if err == nil {
		output, err = op(ctx, input)
	}
	r := reply{Output: output}
	if err != nil {
		declared := new(Error)
		if !errors.As(err, &declared) {
			declared = FailWith(Failed, err, nil)
		}
		r = reply{Error: &replyError{ID: declared.ID, Variables: declared.Variables}}
	}
	return json.NewEncoder(out).Encode(r)
}

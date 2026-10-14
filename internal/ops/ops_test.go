package ops

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"
)

type echoInput struct {
	Text  string `json:"text"`
	Times int    `json:"times"`
}

var testOps = map[string]Op{
	"echo": func(_ context.Context, input json.RawMessage) (any, error) {
		var in echoInput
		if err := Decode(input, &in); err != nil {
			return nil, err
		}
		if in.Text == "" {
			return nil, Fail("empty-text", nil)
		}
		return map[string]any{"echoed": strings.Repeat(in.Text, max(in.Times, 1))}, nil
	},
	"wrapped": func(context.Context, json.RawMessage) (any, error) {
		return nil, fmt.Errorf("while echoing: %w", Fail("too-long", map[string]any{"limit": 10}))
	},
	"broken": func(context.Context, json.RawMessage) (any, error) { return nil, errors.New("disk full") },
}

func call(t *testing.T, name, input string) string {
	t.Helper()
	op, err := Find(testOps, name)
	if err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	if err := Call(context.Background(), op, strings.NewReader(input), &out); err != nil {
		t.Fatalf("Call(%s): %v", name, err)
	}
	return strings.TrimSpace(out.String())
}

func TestCallRepliesWithTheOutputOrADeclaredError(t *testing.T) {
	cases := []struct{ name, input, want string }{
		{"echo", `{"text":"hi","times":2}`, `{"output":{"echoed":"hihi"}}`},
		{"echo", ``, `{"error":{"id":"empty-text","variables":{}}}`},
		{"wrapped", `{}`, `{"error":{"id":"too-long","variables":{"limit":10}}}`},
		{"broken", `{}`, `{"error":{"id":"failed","variables":{"cause":"disk full"}}}`},
	}
	for _, c := range cases {
		if got := call(t, c.name, c.input); got != c.want {
			t.Errorf("%s %s: got %s, want %s", c.name, c.input, got, c.want)
		}
	}
}

func TestDecodeRefusesWhatTheOperationDoesntTake(t *testing.T) {
	for _, input := range []string{`{"text":"hi","color":"red"}`, `{"text":1}`, `[1]`, `not json`} {
		got := call(t, "echo", input)
		if !strings.HasPrefix(got, `{"error":{"id":"bad-input","variables":{"cause":`) {
			t.Errorf("echo %s: got %s, want bad-input", input, got)
		}
	}
}

func TestFindRefusesAnOperationTheVaultDoesntHave(t *testing.T) {
	_, err := Find(testOps, "fly")
	if !errors.Is(err, ErrUnknown) || !strings.Contains(err.Error(), "broken, echo, wrapped") {
		t.Errorf("got %v, want ErrUnknown naming the operations", err)
	}
}

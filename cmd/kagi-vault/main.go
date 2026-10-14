// kagi-vault: the piebird-kagi-search plugin's vault, the one program that holds the person's Kagi
// session and talks to Kagi. The plugin's shells run `kagi-vault call <operation>` (ops.go): the
// input as JSON on stdin, one reply on stdout (internal/ops), which never carries the session. A
// person runs `sign-in`, `sign-out` and `status`. Kagi's addresses are fixed here; nothing the
// shells send can point a request elsewhere.
package main

import (
	"bufio"
	"context"
	"embed"
	"errors"
	"flag"
	"fmt"
	"io"
	"math"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"time"

	"piebird.dev/plugins/internal/ops"
	"piebird.dev/plugins/internal/secrets"
	"piebird.dev/plugins/internal/text"
)

// program is the program's name (catalog.json "program"): its entry in the system's secret store
// and its config and cache folders'.
const program = "kagi-vault"

// declared is the plugin's core/settings.json, which the build copies here: its secrets.
//
//go:embed settings.gen.json
var declared embed.FS

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	self, _ := os.Executable()
	store := secrets.ForProgram(program, secrets.Must(declared, "settings.gen.json"))
	code := run(ctx, newVault(store, filepath.Clean(self)), os.Args[1:], stdio{os.Stdin, os.Stdout})
	stop()
	os.Exit(code)
}

// errUsage is a command line the vault doesn't take.
var errUsage = errors.New("usage")

// stdio is where a command reads its input and writes its output; errors go to os.Stderr.
type stdio struct {
	in  io.Reader
	out io.Writer
}

// run runs argv and is its exit status: 0, 1 for a failure, 2 for a command line it doesn't take.
func run(ctx context.Context, v *vault, argv []string, std stdio) int {
	var err error
	switch {
	case len(argv) == 2 && argv[0] == "call":
		var op ops.Op
		if op, err = ops.Find(v.ops(), argv[1]); err == nil {
			err = ops.Call(ctx, op, std.in, std.out)
		}
	case len(argv) >= 1 && argv[0] == "sign-in":
		err = signIn(ctx, v, argv[1:], std)
	case len(argv) == 1 && argv[0] == "sign-out":
		if err = v.signOut(); err == nil {
			_, err = fmt.Fprintln(std.out, says("signed-out"))
		}
	case len(argv) == 1 && argv[0] == "status":
		err = statusCommand(ctx, v, std.out)
	default:
		err = errUsage
	}
	return report(err)
}

// report writes err for the person, if any, and is the exit status for it.
func report(err error) int {
	switch {
	case err == nil:
		return 0
	case errors.Is(err, ops.ErrUnknown):
		_, _ = fmt.Fprintln(os.Stderr, err)
		return 2
	case errors.Is(err, errUsage):
		_, _ = fmt.Fprintln(os.Stderr, says("usage"))
		return 2
	}
	_, _ = fmt.Fprintln(os.Stderr, says("fail", text.V{"Cause": forPeople(err)}))
	return 1
}

// signIn keeps a Session Link read from standard input with --link, or opens the sign-in page and
// waits for it. The link is a credential, so it never comes on the command line, where the
// system's process list and the shell's history would keep it.
func signIn(ctx context.Context, v *vault, argv []string, std stdio) error {
	fs := flag.NewFlagSet("sign-in", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	link := fs.Bool("link", false, "")
	if err := fs.Parse(argv); err != nil || fs.NArg() > 0 {
		return errUsage
	}
	var err error
	if *link {
		_, _ = fmt.Fprint(os.Stderr, says("paste-link"))
		pasted, _ := bufio.NewReader(std.in).ReadString('\n')
		if strings.TrimSpace(pasted) == "" {
			return errUsage
		}
		err = v.signedIn(ctx, strings.TrimSpace(pasted))
	} else {
		err = signInOnPage(ctx, v, std.out)
	}
	if err != nil {
		return err
	}
	v.mu.Lock()
	from := v.from
	v.mu.Unlock()
	_, err = fmt.Fprintln(std.out, says("signed-in", text.V{"From": from.String()}))
	return err
}

// signInOnPage opens the sign-in page, says where it is and waits until the person signs in there.
func signInOnPage(ctx context.Context, v *vault, out io.Writer) error {
	flow := v.signInFlow()
	defer flow.Close()
	url, err := flow.Start()
	if url == "" {
		return err
	}
	if _, err := fmt.Fprintln(out, says("sign-in-page", text.V{"URL": url, "Opened": err == nil})); err != nil {
		return err
	}
	if !flow.Wait(ctx, time.Duration(math.MaxInt64)) {
		return ctx.Err()
	}
	return nil
}

func statusCommand(ctx context.Context, v *vault, out io.Writer) error {
	s, err := v.status(ctx)
	if err != nil {
		return err
	}
	switch {
	case s.From == nil:
		_, err = fmt.Fprintln(out, says("status.none"))
	case s.SignedIn:
		_, err = fmt.Fprintln(out, says("status.signed-in", text.V{"From": s.From.String()}))
	default:
		problem := forPeople(ops.Fail(s.Problem.ID, s.Problem.Variables))
		_, err = fmt.Fprintln(out, says("status.refused", text.V{"From": s.From.String(), "Problem": problem}))
	}
	return err
}

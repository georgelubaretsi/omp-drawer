// Package results keeps what is too long to send an agent whole: each in a file it can read a
// part at a time with its own tools. Files go in the user's cache folder and are deleted a day
// later.
package results

import (
	"crypto/rand"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"

	"piebird.dev/plugins/internal/dirs"
	"piebird.dev/plugins/internal/ops"
)

// Store is where a program's saved answers go.
type Store struct {
	// Dir holds the files.
	Dir string
	// Keep is how long a file stays.
	Keep time.Duration
}

// ForProgram is the store of the program name: <user cache>/piebird/<name>/results, a day.
func ForProgram(name string) (*Store, error) {
	dir, err := dirs.Cache(name)
	if err != nil {
		return nil, ops.FailWith("cannot-keep", err, nil)
	}
	return &Store{Dir: filepath.Join(dir, "results"), Keep: 24 * time.Hour}, nil
}

// Saved is where an answer went and how it starts.
type Saved struct {
	Path    string `json:"path"`
	Type    string `json:"type"`
	Bytes   int    `json:"bytes"`
	Preview string `json:"preview,omitempty"`
}

// previewSize bounds the start of a saved answer shown in its place.
const previewSize = 2 << 10

// extensions are the file names' endings for the types saved; anything else is .txt or .bin.
var extensions = map[string]string{
	"application/json": ".json", "text/markdown": ".md", "text/html": ".html",
	"application/xml": ".xml", "text/plain": ".txt",
}

// Save writes data, of the media type mime, to a new file and drops the files older than Keep. A
// file it can't write is the declared error cannot-keep.
func (s *Store) Save(data []byte, mime string) (Saved, error) {
	s.prune()
	if err := os.MkdirAll(s.Dir, 0o700); err != nil {
		return Saved{}, ops.FailWith("cannot-keep", err, nil)
	}
	id := make([]byte, 6)
	_, _ = rand.Read(id) // never fails (crypto/rand)
	path := filepath.Join(s.Dir, hex.EncodeToString(id)+extension(mime, data))
	if err := os.WriteFile(path, data, 0o600); err != nil {
		return Saved{}, ops.FailWith("cannot-keep", err, nil)
	}
	return Saved{Path: path, Type: mime, Bytes: len(data), Preview: preview(data)}, nil
}

func extension(mime string, data []byte) string {
	base, _, _ := strings.Cut(mime, ";")
	if ext, ok := extensions[strings.TrimSpace(base)]; ok {
		return ext
	}
	if utf8.Valid(data) {
		return ".txt"
	}
	return ".bin"
}

// preview is how data starts, when it's text: whole lines up to previewSize, without the blank
// lines it starts with and with each run of blank lines as one (pages often begin with dozens).
// A first line longer than that is cut.
func preview(data []byte) string {
	if !utf8.Valid(data) {
		return ""
	}
	window := strings.ToValidUTF8(string(data[:min(len(data), 8*previewSize)]), "")
	var lines []string
	size, blank := 0, false
	for line := range strings.SplitSeq(strings.TrimLeft(window, " \t\r\n"), "\n") {
		if strings.TrimSpace(line) == "" {
			if blank {
				continue
			}
			line = ""
		}
		blank = line == ""
		if size+len(line) > previewSize {
			if len(lines) == 0 {
				lines = append(lines, strings.ToValidUTF8(line[:previewSize], ""))
			}
			break
		}
		lines, size = append(lines, line), size+len(line)+1
	}
	return strings.TrimRight(strings.Join(lines, "\n"), "\n")
}

// prune deletes the files older than Keep; one it can't delete stays for the next time.
func (s *Store) prune() {
	entries, _ := os.ReadDir(s.Dir)
	for _, e := range entries {
		if info, err := e.Info(); err == nil && time.Since(info.ModTime()) > s.Keep {
			_ = os.Remove(filepath.Join(s.Dir, e.Name()))
		}
	}
}

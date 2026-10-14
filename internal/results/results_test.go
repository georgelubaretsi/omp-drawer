package results

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func store(t *testing.T) *Store {
	t.Helper()
	return &Store{Dir: filepath.Join(t.TempDir(), "results"), Keep: time.Hour}
}

func TestASavedAnswerIsAFileOnlyItsOwnerReads(t *testing.T) {
	s := store(t)
	saved, err := s.Save([]byte("{\"a\":1}"), "application/json")
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Ext(saved.Path) != ".json" || saved.Bytes != 7 || saved.Type != "application/json" {
		t.Errorf("saved %+v", saved)
	}
	data, err := os.ReadFile(saved.Path)
	if err != nil || string(data) != "{\"a\":1}" {
		t.Errorf("read back %q %v", data, err)
	}
	if info, err := os.Stat(saved.Path); err != nil || info.Mode().Perm() != 0o600 {
		t.Errorf("file mode %v %v", info.Mode(), err)
	}
}

func TestTypesPickTheFileEnding(t *testing.T) {
	s := store(t)
	for mime, ext := range map[string]string{
		"text/html; charset=utf-8": ".html", "text/markdown": ".md", "application/xml": ".xml",
		"text/css": ".txt", "": ".txt",
	} {
		if saved, err := s.Save([]byte("x"), mime); err != nil || filepath.Ext(saved.Path) != ext {
			t.Errorf("%q: %s %v", mime, saved.Path, err)
		}
	}
	saved, err := s.Save([]byte{0xff, 0xfe}, "")
	if err != nil || filepath.Ext(saved.Path) != ".bin" || saved.Preview != "" {
		t.Errorf("binary: %+v %v", saved, err)
	}
}

func TestPreviewEndsOnALine(t *testing.T) {
	s := store(t)
	short, _ := s.Save([]byte("one\ntwo"), "text/plain")
	if short.Preview != "one\ntwo" {
		t.Errorf("short %q", short.Preview)
	}
	long := strings.Repeat("é line\n", 1000)
	saved, _ := s.Save([]byte(long), "text/plain")
	if len(saved.Preview) > previewSize || !strings.HasSuffix(saved.Preview, "é line") || !strings.HasPrefix(long, saved.Preview) {
		t.Errorf("preview of %d bytes ends %q", len(saved.Preview), saved.Preview[len(saved.Preview)-10:])
	}
}

func TestPreviewSkipsBlankLinesAndCutsALongFirstLine(t *testing.T) {
	if got := preview([]byte("\n\n  \n<html>\n\n \n\n<body>\r\n\n")); got != "<html>\n\n<body>\r" {
		t.Errorf("blank lines: %q", got)
	}
	if got := preview([]byte(strings.Repeat("é", previewSize))); len(got) > previewSize || !strings.HasPrefix(got, "éé") {
		t.Errorf("a long first line: %d bytes", len(got))
	}
}

func TestOldAnswersGoAtTheNextSave(t *testing.T) {
	s := store(t)
	old, _ := s.Save([]byte("old"), "text/plain")
	past := time.Now().Add(-2 * time.Hour)
	if err := os.Chtimes(old.Path, past, past); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Save([]byte("new"), "text/plain"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(old.Path); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("an old answer stays after a save: %v", err)
	}
}

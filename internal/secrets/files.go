package secrets

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
)

// errDamaged marks a file that isn't a JSON object of strings.
var errDamaged = errors.New("not a JSON object of strings")

// readStrings reads file, a JSON object of strings; a missing file holds none. A damaged one is
// errDamaged; either error comes with an empty map.
func readStrings(file string) (map[string]string, error) {
	raw, err := os.ReadFile(file)
	if errors.Is(err, fs.ErrNotExist) {
		return map[string]string{}, nil
	}
	if err != nil {
		return map[string]string{}, err
	}
	var m map[string]string
	if err := json.Unmarshal(raw, &m); err != nil {
		return map[string]string{}, fmt.Errorf("%w: %w", errDamaged, err)
	}
	if m == nil {
		m = map[string]string{}
	}
	return m, nil
}

// writeStrings replaces file whole with m, so another process reads the old contents or the new,
// never a mix. The file is readable only by its owner, in a folder only they can open.
func writeStrings(file string, m map[string]string) error {
	data, _ := json.MarshalIndent(m, "", "  ") //nolint:errchkjson // a map of strings always encodes
	if err := os.MkdirAll(filepath.Dir(file), 0o700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(file), filepath.Base(file)+".*") // mode 0600
	if err != nil {
		return err
	}
	_, err = tmp.Write(append(data, '\n'))
	err = errors.Join(err, tmp.Close())
	if err == nil {
		err = os.Rename(tmp.Name(), file)
	}
	if err != nil {
		_ = os.Remove(tmp.Name())
	}
	return err
}

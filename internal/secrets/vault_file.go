package secrets

import "errors"

// fileVault keeps secrets in a JSON file only its owner can read, in a folder only they can open:
// for a system with no secret store running.
type fileVault struct{ path string }

func (f fileVault) get(key string) (string, bool, error) {
	m, err := readStrings(f.path)
	if err != nil {
		return "", false, err
	}
	return m[key], m[key] != "", nil
}

func (f fileVault) set(key, _, secret string) error {
	m, err := readStrings(f.path)
	if err != nil && !errors.Is(err, errDamaged) { // A damaged file is replaced by the secret being kept.
		return err
	}
	m[key] = secret
	return writeStrings(f.path, m)
}

func (f fileVault) forget(key string) error {
	m, err := readStrings(f.path)
	if err != nil {
		return err
	}
	if _, ok := m[key]; !ok {
		return nil
	}
	delete(m, key)
	return writeStrings(f.path, m)
}

func (f fileVault) source() Source { return Source{Kind: "file", Path: f.path} }

// Package secrets keeps the secrets a plugin declares in its core/settings.json, which its vault
// embeds a copy of: in the system's secret store, the macOS Keychain, Windows Credential Manager or
// the Secret Service elsewhere, else a file only its owner can read (vault_*.go). A secret whose
// declaration names an env comes from that environment variable when it is set: the only
// environment variables a vault reads for itself. The plugin's other settings are the TypeScript
// kit's (kit/core/settings.ts).
package secrets

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/fs"
	"maps"
	"slices"
)

// Secret is a credential a person gives the plugin. Env, when set, names the environment variable
// that supplies it instead, for CI and containers. Key is its name in settings.json.
type Secret struct {
	Key   string `json:"-"`
	Title string `json:"title"`
	About string `json:"about"`
	Env   string `json:"env"`
}

// Load reads the secrets of a settings.json, sorted by key, refusing a field a secret doesn't have.
func Load(raw []byte) ([]Secret, error) {
	var file struct {
		Schema   string            `json:"$schema"`
		Settings json.RawMessage   `json:"settings"`
		Secrets  map[string]Secret `json:"secrets"`
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&file); err != nil {
		return nil, err
	}
	out := make([]Secret, 0, len(file.Secrets))
	for _, key := range slices.Sorted(maps.Keys(file.Secrets)) {
		s := file.Secrets[key]
		s.Key = key
		out = append(out, s)
	}
	return out, nil
}

// Must loads the secrets of the file name of fsys, an embedded one: it is part of the program, so
// a fault in it is the program's (its tests load it).
func Must(fsys fs.FS, name string) []Secret {
	raw, err := fs.ReadFile(fsys, name)
	if err == nil {
		var secrets []Secret
		if secrets, err = Load(raw); err == nil {
			return secrets
		}
	}
	panic(fmt.Sprintf("secrets: %s: %v", name, err))
}

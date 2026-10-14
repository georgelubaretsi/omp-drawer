// Package dirs is where a program keeps its files: piebird/<program> in the person's config and
// cache folders (os.UserConfigDir, os.UserCacheDir), the one place that names them.
package dirs

import (
	"os"
	"path/filepath"
)

// root is the folder every program's files go under.
const root = "piebird"

// Config is the program's folder in the person's config folder.
func Config(program string) (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, root, program), nil
}

// Cache is the program's folder in the person's cache folder.
func Cache(program string) (string, error) {
	dir, err := os.UserCacheDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, root, program), nil
}

package main

// What the vault says to people, on its command line and on the sign-in page, in
// templates/people.md. What the model reads is the plugin's core/model.ftl's.

import (
	"embed"
	"errors"
	"slices"

	"piebird.dev/plugins/internal/ops"
	"piebird.dev/plugins/internal/text"
)

//go:embed templates
var files embed.FS

var words = text.Must(files, "templates").Get("people")

// says is the text key in people's words, filled with v.
func says(key string, v ...text.V) string {
	if len(v) == 0 {
		return words.Text(key, nil)
	}
	return words.Text(key, v[0])
}

// forPeople is err in a person's words: the sign-in page shows it as it is.
func forPeople(err error) error {
	if err == nil {
		return nil
	}
	declared := new(ops.Error)
	if errors.As(err, &declared) && slices.Contains(words.Keys("errors"), declared.ID) {
		return errors.New(says("errors."+declared.ID, text.V(declared.Variables)))
	}
	return errors.New(says("errors.other", text.V{"Error": err.Error()}))
}

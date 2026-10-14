package kagi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"

	"golang.org/x/net/html"
)

// Answer is a Quick Answer: markdown with footnote marks ([^1]), and its sources as the footnotes.
type Answer struct {
	Answer     string `json:"answer"`
	References string `json:"references,omitempty"`
}

// Quick asks Kagi's Quick Answer: a short answer written from live results.
func (c *Client) Quick(ctx context.Context, question string) (Answer, error) {
	question = strings.TrimSpace(question)
	if question == "" {
		return Answer{}, errEmptyQuery
	}
	req, err := c.request(ctx, http.MethodPost, "/mother/context", url.Values{"q": {question}})
	if err != nil {
		return Answer{}, err
	}
	req.Header.Set("Accept", "application/vnd.kagi.stream")
	body, err := c.session(req)
	if err != nil {
		return Answer{}, err
	}
	return parseQuick(body)
}

// parseQuick reads the answer stream: frames `<tag>:<json>` separated by NUL and newline. The
// last frame, new_message.json, holds the whole answer as markdown with its references; without
// it, the last tokens.json frame holds the answer so far, as HTML.
func parseQuick(stream string) (Answer, error) {
	var tokens string
	for frame := range strings.SplitSeq(stream, "\x00\n") {
		tag, payload, ok := strings.Cut(strings.TrimSpace(frame), ":")
		if !ok {
			continue
		}
		switch tag {
		case "new_message.json":
			var m struct {
				Markdown   string `json:"md"`
				References string `json:"references_md"`
			}
			if err := json.Unmarshal([]byte(payload), &m); err != nil {
				return Answer{}, failReading("answer", err)
			}
			if strings.TrimSpace(m.Markdown) != "" {
				return Answer{Answer: strings.TrimSpace(m.Markdown), References: strings.TrimSpace(m.References)}, nil
			}
		case "tokens.json":
			var t struct {
				Text string `json:"text"`
			}
			if json.Unmarshal([]byte(payload), &t) == nil && t.Text != "" {
				tokens = t.Text
			}
		}
	}
	if tokens != "" {
		if doc, err := html.Parse(strings.NewReader(tokens)); err == nil {
			return Answer{Answer: nodeText(doc, nil)}, nil
		}
	}
	return Answer{}, fail("no-quick-answer", nil)
}

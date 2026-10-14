package kagi

import (
	"context"
	"net/url"
	"slices"
	"strings"
	"time"

	"golang.org/x/net/html"
)

// Query is one web search.
type Query struct {
	Text string
	// Time is day, week, month or year: results from that last period.
	Time string
	// From and To bound the results' dates, YYYY-MM-DD.
	From, To string
	// Limit caps the results; 0 means 10.
	Limit int
}

// Result is one search result.
type Result struct {
	Title   string `json:"title"`
	URL     string `json:"url"`
	Snippet string `json:"snippet,omitempty"`
	// Date is the result's date as YYYY-MM-DD, or Kagi's own words for it ("3 days ago").
	Date string `json:"date,omitempty"`
}

var periods = []string{"day", "week", "month", "year"}

// errEmptyQuery is every search's answer to a blank query.
var errEmptyQuery = fail("empty-query", nil)

func (q *Query) check() error {
	if strings.TrimSpace(q.Text) == "" {
		return errEmptyQuery
	}
	if q.Limit < 0 || q.Limit > 50 {
		return fail("limit", nil)
	}
	if q.Time != "" {
		if !slices.Contains(periods, q.Time) {
			return oneOf("time", periods, q.Time)
		}
		if q.From != "" || q.To != "" {
			return fail("time-and-dates", nil)
		}
	}
	return q.checkRange()
}

// checkRange checks from_date and to_date: real dates, the first not after the second.
func (q *Query) checkRange() error {
	for _, d := range []string{q.From, q.To} {
		if _, err := time.Parse(time.DateOnly, d); d != "" && err != nil {
			return fail("date", map[string]any{"got": d})
		}
	}
	if q.From != "" && q.To != "" && q.From > q.To {
		return fail("dates-order", map[string]any{"from": q.From, "to": q.To})
	}
	return nil
}

// Search runs one web search.
func (c *Client) Search(ctx context.Context, q Query) ([]Result, error) {
	if err := q.check(); err != nil {
		return nil, err
	}
	params := url.Values{"q": {strings.TrimSpace(q.Text)}}
	for key, v := range map[string]string{"dr": q.Time, "from_date": q.From, "to_date": q.To} {
		if v != "" {
			params.Set(key, v)
		}
	}
	body, err := c.page(ctx, "/html/search", params)
	if err != nil {
		return nil, err
	}
	doc, err := html.Parse(strings.NewReader(body))
	if err != nil {
		return nil, failReading("results", err)
	}
	results := parseResults(doc)
	limit := q.Limit
	if limit == 0 {
		limit = 10
	}
	return results[:min(limit, len(results))], nil
}

// parseResults reads a result page: each .search-result, and each grouped result (.__srgi), in
// page order, once per URL.
func parseResults(doc *html.Node) []Result {
	var out []Result
	seen := map[string]bool{}
	match := func(n *html.Node) bool { return hasClass(n, "search-result") || hasClass(n, "__srgi") }
	each(doc, match, func(n *html.Node) {
		r, ok := parseResult(n)
		if ok && !seen[r.URL] {
			seen[r.URL] = true
			out = append(out, r)
		}
	})
	return out
}

func parseResult(n *html.Node) (Result, bool) {
	link := find(n, classed("__sri_title_link"))
	if link == nil {
		if title := find(n, classed("__srgi-title")); title != nil {
			link = find(title, func(n *html.Node) bool { return n.Type == html.ElementNode && n.Data == "a" })
		}
	}
	if link == nil {
		return Result{}, false
	}
	r := Result{Title: nodeText(link, nil), URL: strings.TrimSpace(attr(link, "href"))}
	if desc := find(n, classed("__sri-desc")); desc != nil {
		timeNode := find(desc, classed("__sri-time"))
		r.Date = resultDate(nodeText(timeNode, nil))
		r.Snippet = nodeText(desc, func(m *html.Node) bool { return m == timeNode || hasClass(m, "summarize-link") })
	}
	return r, r.Title != "" && strings.HasPrefix(r.URL, "http")
}

// resultDate turns Kagi's "Jun 29, 2016" into 2016-06-29 and keeps other words as they are.
func resultDate(s string) string {
	if t, err := time.Parse("Jan 2, 2006", s); err == nil {
		return t.Format(time.DateOnly)
	}
	return s
}

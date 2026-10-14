package kagi

import (
	"context"
	"encoding/json"
	"net/url"
	"strconv"
	"strings"
)

// Story is one Kagi News story.
type Story struct {
	Title    string `json:"title"`
	Emoji    string `json:"emoji"`
	Category string `json:"category"`
	Summary  string `json:"short_summary"`
	Articles []struct {
		Title  string `json:"title"`
		Link   string `json:"link"`
		Domain string `json:"domain"`
		Date   string `json:"date"`
	} `json:"articles"`
}

// Category is one Kagi News category of the latest batch.
type Category struct {
	// Ref is the category's id within the batch; ID its lasting name, e.g. world.
	Ref     string `json:"id"`
	ID      string `json:"categoryId"`
	Name    string `json:"categoryName"`
	Stories int    `json:"clusterCount"`
}

// Chaos is Kagi News' chaos index: how unsettled the world looks today, 0 to 100.
type Chaos struct {
	Index       int    `json:"chaosIndex"`
	Description string `json:"chaosDescription"`
	Updated     string `json:"chaosLastUpdated"`
}

func (c *Client) newsJSON(ctx context.Context, path string, q url.Values, into any) error {
	body, err := c.public(ctx, c.NewsBase, path, q)
	if err != nil {
		return err
	}
	if err := json.Unmarshal([]byte(body), into); err != nil {
		return failReading("news", err)
	}
	return nil
}

// latest is the id of Kagi News' latest batch in lang.
func (c *Client) latest(ctx context.Context, lang string) (string, error) {
	var b struct {
		ID string `json:"id"`
	}
	if err := c.newsJSON(ctx, "/api/batches/latest", url.Values{"lang": {lang}}, &b); err != nil {
		return "", err
	}
	if b.ID == "" {
		return "", fail("no-batch", nil)
	}
	return b.ID, nil
}

// Categories lists the latest batch's categories in lang.
func (c *Client) Categories(ctx context.Context, lang string) ([]Category, error) {
	_, cats, err := c.categories(ctx, lang)
	return cats, err
}

func (c *Client) categories(ctx context.Context, lang string) (string, []Category, error) {
	batch, err := c.latest(ctx, lang)
	if err != nil {
		return "", nil, err
	}
	var list struct {
		Categories []Category `json:"categories"`
	}
	err = c.newsJSON(ctx, "/api/batches/"+url.PathEscape(batch)+"/categories", url.Values{"lang": {lang}}, &list)
	return batch, list.Categories, err
}

// NewsQuery asks for today's stories of a category (its id or name, e.g. world, tech) in Lang,
// up to Limit, without those Hide matches.
type NewsQuery struct {
	Category, Lang string
	Limit          int
	Hide           Filter
}

// News is the latest stories q asks for.
func (c *Client) News(ctx context.Context, q NewsQuery) ([]Story, error) {
	batch, cats, err := c.categories(ctx, q.Lang)
	if err != nil {
		return nil, err
	}
	cat, err := pickCategory(cats, q.Category)
	if err != nil {
		return nil, err
	}
	var payload struct {
		Stories []Story `json:"stories"`
	}
	path := "/api/batches/" + url.PathEscape(batch) + "/categories/" + url.PathEscape(cat.Ref) + "/stories"
	// Fetch more than asked: hidden stories leave gaps.
	params := url.Values{"lang": {q.Lang}, "limit": {strconv.Itoa(min(q.Limit*3, 100))}}
	if err := c.newsJSON(ctx, path, params, &payload); err != nil {
		return nil, err
	}
	var out []Story
	for i := range payload.Stories {
		if len(out) < q.Limit && !q.Hide.Matches(&payload.Stories[i]) {
			out = append(out, payload.Stories[i])
		}
	}
	return out, nil
}

func pickCategory(cats []Category, want string) (Category, error) {
	want = strings.TrimSpace(want)
	for _, c := range cats {
		if strings.EqualFold(c.ID, want) || strings.EqualFold(c.Name, want) {
			return c, nil
		}
	}
	return Category{}, fail("no-category", map[string]any{"want": want, "count": len(cats)})
}

// Chaos is the latest chaos index.
func (c *Client) Chaos(ctx context.Context, lang string) (Chaos, error) {
	var ch Chaos
	batch, err := c.latest(ctx, lang)
	if err != nil {
		return ch, err
	}
	err = c.newsJSON(ctx, "/api/batches/"+url.PathEscape(batch)+"/chaos", url.Values{"lang": {lang}}, &ch)
	return ch, err
}

package handlers

import (
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/go-chi/chi/v5"
)

type PathHandler struct{}

func (h *PathHandler) Routes(r chi.Router) {
	r.Get("/repo-suggest", h.suggest)
}

type repoSuggestResponse struct {
	Valid       bool     `json:"valid"`
	Suggestions []string `json:"suggestions"`
}

func (h *PathHandler) suggest(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	valid, suggestions := suggestRepoPath(path)
	if suggestions == nil {
		suggestions = []string{}
	}
	writeJSON(w, http.StatusOK, repoSuggestResponse{Valid: valid, Suggestions: suggestions})
}

func expandHome(path string) string {
	if path == "~" || strings.HasPrefix(path, "~/") {
		home, err := os.UserHomeDir()
		if err != nil {
			return path
		}
		return filepath.Join(home, strings.TrimPrefix(path, "~"))
	}
	return path
}

// suggestRepoPath checks whether path is a real directory. If not, it walks
// up the path looking for the nearest ancestor that does exist, then ranks
// that ancestor's subdirectories by similarity to what the user typed —
// a "did you mean" list instead of a hard validation error.
func suggestRepoPath(path string) (bool, []string) {
	if path == "" {
		return false, nil
	}
	expanded := expandHome(path)
	if !filepath.IsAbs(expanded) {
		return false, nil
	}
	if info, err := os.Stat(expanded); err == nil && info.IsDir() {
		return true, nil
	}

	dir := filepath.Clean(expanded)
	base := filepath.Base(expanded)
	for {
		parent := filepath.Dir(dir)
		if parent == dir {
			return false, nil
		}
		dir = parent

		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}

		type scored struct {
			path  string
			score int
		}
		var candidates []scored
		for _, e := range entries {
			if !e.IsDir() || strings.HasPrefix(e.Name(), ".") {
				continue
			}
			candidates = append(candidates, scored{filepath.Join(dir, e.Name()), similarityScore(base, e.Name())})
		}
		if len(candidates) == 0 {
			continue
		}
		sort.Slice(candidates, func(i, j int) bool { return candidates[i].score < candidates[j].score })

		out := make([]string, 0, 5)
		for i, c := range candidates {
			if i >= 5 {
				break
			}
			out = append(out, c.path)
		}
		return false, out
	}
}

// similarityScore ranks b against a — lower is a better match. Prefix and
// substring matches are weighted far below edit distance so a typo'd suffix
// ("endpont" vs "endpoint") still beats an unrelated same-length name.
func similarityScore(a, b string) int {
	al, bl := strings.ToLower(a), strings.ToLower(b)
	switch {
	case al == bl:
		return -1000
	case strings.HasPrefix(bl, al) || strings.HasPrefix(al, bl):
		return -500 + levenshtein(al, bl)
	case strings.Contains(bl, al) || strings.Contains(al, bl):
		return -200 + levenshtein(al, bl)
	default:
		return levenshtein(al, bl)
	}
}

func levenshtein(a, b string) int {
	ar, br := []rune(a), []rune(b)
	m, n := len(ar), len(br)
	prev := make([]int, n+1)
	curr := make([]int, n+1)
	for j := 0; j <= n; j++ {
		prev[j] = j
	}
	for i := 1; i <= m; i++ {
		curr[0] = i
		for j := 1; j <= n; j++ {
			cost := 1
			if ar[i-1] == br[j-1] {
				cost = 0
			}
			curr[j] = min(curr[j-1]+1, prev[j]+1, prev[j-1]+cost)
		}
		prev, curr = curr, prev
	}
	return prev[n]
}

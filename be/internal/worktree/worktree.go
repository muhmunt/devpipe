package worktree

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// Ensure creates (or reuses) an isolated git worktree for repoPath on branch,
// so agents never operate directly on the real working tree.
func Ensure(repoPath, branch string) (string, error) {
	base := filepath.Base(repoPath)
	path := filepath.Join(filepath.Dir(repoPath), ".devpipe-worktrees", base+"-"+branch)

	if _, err := os.Stat(path); err == nil {
		return path, nil
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return "", fmt.Errorf("mkdir worktree parent: %w", err)
	}

	branchExists := exec.Command("git", "-C", repoPath, "rev-parse", "--verify", branch).Run() == nil

	var cmd *exec.Cmd
	if branchExists {
		cmd = exec.Command("git", "-C", repoPath, "worktree", "add", path, branch)
	} else {
		cmd = exec.Command("git", "-C", repoPath, "worktree", "add", path, "-b", branch)
	}

	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("git worktree add: %s: %w", out, err)
	}
	return path, nil
}

// ChangedFiles returns paths modified in the worktree relative to HEAD
// (staged, unstaged, and untracked).
func ChangedFiles(worktreePath string) ([]string, error) {
	out, err := exec.Command("git", "-C", worktreePath, "status", "--porcelain").Output()
	if err != nil {
		return nil, fmt.Errorf("git status: %w", err)
	}
	var files []string
	for _, line := range strings.Split(strings.TrimRight(string(out), "\n"), "\n") {
		if line == "" {
			continue
		}
		files = append(files, strings.TrimSpace(line[3:]))
	}
	return files, nil
}

// CommitAll stages and commits any pending changes in the worktree onto its
// branch. Returns false if there was nothing to commit.
func CommitAll(worktreePath, message string) (bool, error) {
	addCmd := exec.Command("git", "add", "-A")
	addCmd.Dir = worktreePath
	if out, err := addCmd.CombinedOutput(); err != nil {
		return false, fmt.Errorf("git add: %s: %w", out, err)
	}

	diffCmd := exec.Command("git", "diff", "--cached", "--quiet")
	diffCmd.Dir = worktreePath
	if err := diffCmd.Run(); err == nil {
		return false, nil // nothing staged
	}

	commitCmd := exec.Command("git", "commit", "-m", message)
	commitCmd.Dir = worktreePath
	if out, err := commitCmd.CombinedOutput(); err != nil {
		return false, fmt.Errorf("git commit: %s: %w", out, err)
	}
	return true, nil
}

// RenameBranch renames the branch currently checked out in the worktree.
func RenameBranch(worktreePath, newName string) error {
	cmd := exec.Command("git", "branch", "-m", newName)
	cmd.Dir = worktreePath
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("git branch -m: %s: %w", out, err)
	}
	return nil
}

// Merge merges branch into repoPath's current checked-out branch, --no-ff.
func Merge(repoPath, branch string) (string, error) {
	cmd := exec.Command("git", "-C", repoPath, "merge", "--no-ff", "-m", "devpipe: merge "+branch, branch)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return string(out), fmt.Errorf("git merge: %s: %w", out, err)
	}
	return string(out), nil
}

// DiffFile returns the unified diff for a single file, including untracked files.
func DiffFile(worktreePath, file string) (string, error) {
	out, err := exec.Command("git", "-C", worktreePath, "diff", "--no-color", "HEAD", "--", file).Output()
	if err != nil {
		return "", fmt.Errorf("git diff: %w", err)
	}
	if len(out) > 0 {
		return string(out), nil
	}
	// untracked file: diff against /dev/null
	cmd := exec.Command("git", "diff", "--no-color", "--no-index", "/dev/null", file)
	cmd.Dir = worktreePath
	out, err = cmd.CombinedOutput()
	// git diff --no-index exits 1 when there IS a difference — that's expected, not an error.
	if err != nil && len(out) == 0 {
		return "", fmt.Errorf("git diff --no-index: %w", err)
	}
	return string(out), nil
}

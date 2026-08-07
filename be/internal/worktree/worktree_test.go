package worktree

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func initRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	run := func(args ...string) {
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %s: %v", args, out, err)
		}
	}
	run("init")
	run("config", "user.email", "test@devpipe.local")
	run("config", "user.name", "devpipe test")
	if err := os.WriteFile(filepath.Join(dir, "README.md"), []byte("hello\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	run("add", "-A")
	run("commit", "-m", "init")
	return dir
}

func TestEnsureAndMergeFlow(t *testing.T) {
	repo := initRepo(t)

	internalBranch := "devpipe/tmp-card-1"
	wtPath, err := Ensure(repo, internalBranch)
	if err != nil {
		t.Fatalf("Ensure: %v", err)
	}
	if _, err := os.Stat(wtPath); err != nil {
		t.Fatalf("worktree path missing: %v", err)
	}

	// idempotent re-ensure
	wtPath2, err := Ensure(repo, internalBranch)
	if err != nil || wtPath2 != wtPath {
		t.Fatalf("Ensure not idempotent: %v %v", wtPath2, err)
	}

	newFile := filepath.Join(wtPath, "new.txt")
	if err := os.WriteFile(newFile, []byte("added by agent\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	files, err := ChangedFiles(wtPath)
	if err != nil {
		t.Fatalf("ChangedFiles: %v", err)
	}
	if len(files) != 1 || files[0] != "new.txt" {
		t.Fatalf("expected [new.txt], got %v", files)
	}

	diff, err := DiffFile(wtPath, "new.txt")
	if err != nil {
		t.Fatalf("DiffFile: %v", err)
	}
	if diff == "" {
		t.Fatal("expected non-empty diff for untracked file")
	}

	committed, err := CommitAll(wtPath, "devpipe: test commit")
	if err != nil {
		t.Fatalf("CommitAll: %v", err)
	}
	if !committed {
		t.Fatal("expected CommitAll to report a commit happened")
	}

	// second call, nothing to commit
	committed, err = CommitAll(wtPath, "devpipe: no-op")
	if err != nil {
		t.Fatalf("CommitAll (no-op): %v", err)
	}
	if committed {
		t.Fatal("expected no-op commit to report false")
	}

	// user names the real branch only at accept time
	finalBranch := "feat/user-chosen-name"
	if err := RenameBranch(wtPath, finalBranch); err != nil {
		t.Fatalf("RenameBranch: %v", err)
	}

	out, err := Merge(repo, finalBranch)
	if err != nil {
		t.Fatalf("Merge: %s: %v", out, err)
	}

	mergedFile := filepath.Join(repo, "new.txt")
	if _, err := os.Stat(mergedFile); err != nil {
		t.Fatalf("expected merged file in real repo: %v", err)
	}
}

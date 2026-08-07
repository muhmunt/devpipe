package agent

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
)

type EventKind string

const (
	EventDelta EventKind = "delta" // raw text fragment — concatenate with no separator
	EventTool  EventKind = "tool"  // discrete status line describing a tool action
)

type Adapter interface {
	Invoke(ctx context.Context, cwd, prompt string, onEvent func(kind EventKind, text string)) (exitCode int, finalText string, err error)
}

func For(name string) (Adapter, error) {
	switch name {
	case "claude":
		return claudeAdapter{}, nil
	case "cursor":
		return cursorAdapter{}, nil
	default:
		return nil, fmt.Errorf("unknown agent: %s", name)
	}
}

type claudeAdapter struct{}

func (claudeAdapter) Invoke(ctx context.Context, cwd, prompt string, onEvent func(EventKind, string)) (int, string, error) {
	args := []string{
		"-p", prompt,
		// Headless mode can't answer interactive tool-permission prompts, so without
		// this flag Claude silently skips file edits instead of blocking on them.
		// Safe here specifically because cwd is always an isolated devpipe worktree,
		// never the real repo.
		"--dangerously-skip-permissions",
		// Plain -p fully buffers output until the whole response is ready — confirmed
		// even with a real pty attached, nothing arrives until completion. stream-json
		// gives actual token-by-token deltas and tool-use events as they happen.
		"--output-format", "stream-json",
		"--include-partial-messages",
		"--verbose",
	}
	cmd := exec.CommandContext(ctx, "claude", args...)
	cmd.Dir = cwd

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return -1, "", err
	}
	cmd.Stderr = cmd.Stdout

	if err := cmd.Start(); err != nil {
		return -1, "", err
	}

	var finalText strings.Builder
	toolNames := map[int]string{}
	toolArgs := map[int]*strings.Builder{}

	needsBreakBeforeDelta := false

	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		var env streamEnvelope
		if err := json.Unmarshal(scanner.Bytes(), &env); err != nil {
			continue // non-JSON noise shouldn't occur in stream-json mode; skip defensively
		}

		switch env.Type {
		case "stream_event":
			switch env.Event.Type {
			case "content_block_start":
				if env.Event.ContentBlock.Type == "tool_use" {
					idx := env.Event.Index
					toolNames[idx] = env.Event.ContentBlock.Name
					toolArgs[idx] = &strings.Builder{}
					onEvent(EventTool, "▶ "+friendlyToolStart(env.Event.ContentBlock.Name))
					needsBreakBeforeDelta = true
				}
			case "content_block_delta":
				idx := env.Event.Index
				switch env.Event.Delta.Type {
				case "text_delta":
					text := env.Event.Delta.Text
					if needsBreakBeforeDelta {
						text = "\n" + text
						needsBreakBeforeDelta = false
					}
					finalText.WriteString(env.Event.Delta.Text)
					onEvent(EventDelta, text)
				case "input_json_delta":
					if b, ok := toolArgs[idx]; ok {
						b.WriteString(env.Event.Delta.PartialJSON)
					}
				}
			case "content_block_stop":
				idx := env.Event.Index
				if name, ok := toolNames[idx]; ok {
					if detail := friendlyToolDetail(name, toolArgs[idx].String()); detail != "" {
						onEvent(EventTool, "  → "+detail)
					}
					delete(toolNames, idx)
					delete(toolArgs, idx)
					needsBreakBeforeDelta = true
				}
			}
		case "result":
			if env.Result != "" && finalText.Len() == 0 {
				finalText.WriteString(env.Result)
			}
		}
	}

	err = cmd.Wait()
	exitCode := 0
	if exitErr, ok := err.(*exec.ExitError); ok {
		exitCode = exitErr.ExitCode()
		err = nil
	} else if err != nil {
		return -1, finalText.String(), err
	}
	return exitCode, finalText.String(), nil
}

type streamEnvelope struct {
	Type   string `json:"type"`
	Result string `json:"result"`
	Event  struct {
		Type         string `json:"type"`
		Index        int    `json:"index"`
		ContentBlock struct {
			Type string `json:"type"`
			Name string `json:"name"`
		} `json:"content_block"`
		Delta struct {
			Type        string `json:"type"`
			Text        string `json:"text"`
			PartialJSON string `json:"partial_json"`
		} `json:"delta"`
	} `json:"event"`
}

func friendlyToolStart(name string) string {
	switch name {
	case "Read":
		return "Reading a file…"
	case "Write":
		return "Writing a file…"
	case "Edit":
		return "Editing a file…"
	case "Bash":
		return "Running a command…"
	case "Grep":
		return "Searching the code…"
	case "Glob":
		return "Listing files…"
	default:
		return "Using " + name + "…"
	}
}

func friendlyToolDetail(name, argsJSON string) string {
	var args map[string]any
	if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
		return ""
	}
	switch name {
	case "Read", "Write", "Edit":
		if p, ok := args["file_path"].(string); ok {
			return p
		}
	case "Bash":
		if c, ok := args["command"].(string); ok {
			return c
		}
	case "Grep":
		if p, ok := args["pattern"].(string); ok {
			return `"` + p + `"`
		}
	case "Glob":
		if p, ok := args["pattern"].(string); ok {
			return p
		}
	}
	return ""
}

type cursorAdapter struct{}

func (cursorAdapter) Invoke(ctx context.Context, cwd, prompt string, onEvent func(EventKind, string)) (int, string, error) {
	cmd := exec.CommandContext(ctx, "cursor-agent", "-p", prompt)
	cmd.Dir = cwd

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return -1, "", err
	}
	cmd.Stderr = cmd.Stdout

	if err := cmd.Start(); err != nil {
		return -1, "", err
	}

	var full strings.Builder
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		text := scanner.Text()
		full.WriteString(text)
		full.WriteString("\n")
		onEvent(EventDelta, text+"\n")
	}

	err = cmd.Wait()
	exitCode := 0
	if exitErr, ok := err.(*exec.ExitError); ok {
		exitCode = exitErr.ExitCode()
		err = nil
	} else if err != nil {
		return -1, full.String(), err
	}
	return exitCode, full.String(), nil
}

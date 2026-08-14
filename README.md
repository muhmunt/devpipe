# devpipe

Run coding agents against isolated git worktrees, from a browser.

Each branch gets its own checkout. An agent works inside that checkout and
nowhere else, so several can run at once without touching each other's files
or your main working tree. What the agent does — every file it reads, every
command it runs — is visible as it happens, and the resulting diff is
reviewable and committable in the same window.

The backend is Rust (axum + sqlx + Postgres); the frontend is a Vite React
app. There is no auth: devpipe runs on your machine, spawns agents on your
machine, and is not built to be exposed to a network.

## Requirements

- Rust (stable) and Postgres 14+
- Node 20+
- At least one agent CLI on your `PATH`. Claude Code (`claude`) is the one
  that supports everything here; see [Agents](#agents).

## Running it

```sh
createdb devpipe                       # once; or set DATABASE_URL yourself
cd be-rust && cargo run                # migrations run on boot → :8081
cd fe && npm install && npm run dev    # → :5174, proxies /api to :8081
```

`DATABASE_URL` defaults to `postgres://devpipe:devpipe@localhost:5432/devpipe`.

Open http://localhost:5174 and add a project: point at a folder you already
have, clone a URL, or start an empty repository.

## How it works

**Worktrees.** A project is a git repository. Creating a worktree runs
`git worktree add` into `.worktrees/<id>/` inside it, on a new branch. That
directory is the agent's whole world. Deleting a worktree removes the
checkout devpipe created — never your repository.

**Chats.** A chat is one agent process, scoped to one worktree, streamed to
the browser over SSE. Every event is written to Postgres before it is
broadcast, so the transcript survives a disconnect, a reload, or a server
restart: reconnecting replays the history and then tails the live stream.

Claude's session id is chosen by devpipe and passed as `--session-id`, so a
conversation can be resumed with `--resume` — including after the server that
started it has been restarted and no longer holds the process.

**Tool calls.** Claude's `stream-json` output is parsed structurally. A
tool call's arguments arrive as JSON fragments across several lines and its
result arrives later identified only by a call id, so the parser holds state
to reassemble them. The UI folds a run of calls into one line that opens to
show each step, its arguments, and its output.

**Changes.** Uncommitted and committed work are separate questions and get
separate answers, both measured from the merge base with the target branch —
commits that landed on the target after you branched are not this branch's
work and would otherwise show up backwards, as deletions it never made.

## Agents

Detected at runtime by looking for the executable. `GET /api/agents/catalog`
reports what each one actually accepts, and the UI only offers what is
really there.

| | Claude Code | Cursor |
|---|---|---|
| Multi-turn conversation | yes | no — its CLI has no way to set or recover a conversation id |
| Resume after a restart | yes | no |
| Model choice | `opus`, `sonnet`, `fable` | whatever `cursor-agent --list-models` reports for your account |
| Thinking effort | `low`…`max` | not available |
| File attachments | yes, as `@path` mentions | no |

### Permissions

A headless agent has nobody to answer a permission prompt, so anything not
allowed up front comes back refused. Each chat picks a mode, and each label
below is what that mode was measured to permit when run through this server —
not what its name suggests:

- **Read only** — nothing; every tool call is refused
- **Plan only** — reads and plans, changes nothing
- **Can edit files** — writes files; commands are still refused
- **Can edit and run commands** — both

New chats default to *Can edit files*: the weakest mode that does the work,
with the isolated worktree as the boundary.

## Known limits

- **The terminal is not a PTY.** Each command is its own `sh -c`, so no shell
  state survives between commands and interactive programs won't work. `cd`
  is tracked client-side. Commands run unsandboxed, the same trust model as
  the repository scripts and agent processes devpipe already runs.
- **No CI, review or PR integration.** There is no "Checks" tab because there
  is nothing behind it.
- **Editor handoff is unverified** — no editors were installed to test against.
- **Needs a window at least 768px wide.** Below that it says so rather than
  pretending three panes fit.

## Layout

```
be-rust/     axum server, sqlx migrations, git + agent adapters
fe/          Vite + React + Tailwind v4
design.md    the design system this UI is held to
docs/        specs and build plans
```

`design.md` is not decoration: colours here are contrast-measured against the
surfaces they sit on, and every component file carries a pointer to it.

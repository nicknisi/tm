<h1 align="center">tm</h1>

<p align="center">
  tmux session switcher with live pane previews — grid or list view.
</p>

<p align="center">
  <a href="https://github.com/nicknisi/tm/actions/workflows/ci.yml"><img src="https://github.com/nicknisi/tm/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/nicknisi/tm/releases/latest"><img src="https://img.shields.io/github/v/release/nicknisi/tm" alt="Latest Release" /></a>
</p>

## Why

`tmux choose-tree` lists session names. That's it. `tm` shows you what's actually in each session — a grid of live pane previews — and lets you jump to one with the arrow keys. Press Tab to toggle to a list view with a preview pane.

## Install

### Homebrew

```sh
brew install nicknisi/formulae/tm
```

Or, equivalently:

```sh
brew tap nicknisi/formulae
brew install tm
```

### From source

```sh
git clone https://github.com/nicknisi/tm && cd tm
bun install && bun run build
```

The compiled binary is at `dist/tm`. Requires [Bun](https://bun.sh) when building from source. The Homebrew install is a standalone binary — no runtime needed.

## Usage

Launch the TUI from inside a tmux session:

```sh
tm
```

Or bind it to a tmux popup. Add to `~/.config/tmux/tmux.conf`:

```tmux
bind s display-popup -E "tm"
```

Then press `prefix + s` to open the switcher.

### Flags

| Flag              | Description            |
| ----------------- | ---------------------- |
| `--version`, `-v` | Print version and exit |
| `--help`, `-h`    | Show help and exit     |

### Keybindings

| Key                    | Action                                   |
| ---------------------- | ---------------------------------------- |
| Arrow keys / Ctrl-HJKL | Move selection                           |
| Type any character     | Live-filter sessions by name             |
| Backspace              | Delete a filter character                |
| Enter                  | Switch to selected session (or create)   |
| Tab                    | Toggle between grid and list view        |
| Mouse click            | Switch to the clicked session            |
| Ctrl-D                 | Kill the selected session                |
| Esc                    | Clear filter, or quit if filter is empty |
| Ctrl-C                 | Quit                                     |

## How it works

`tm` shells out to `tmux list-sessions` and `tmux capture-pane` for each session, lays out the previews in an aspect-ratio-scored grid (or a scrollable list with a side preview pane), and renders the whole thing with raw ANSI escape sequences — no TUI framework.

On `Enter`, it calls `tmux switch-client -t <session-id>` and exits.

## Development

```sh
bun install                  # Install dependencies
bun run dev                  # Run directly without compiling
bun run build                # Compile to dist/tm
bun run typecheck            # Type-check with tsc
bun run lint                 # Lint with oxlint
bun run format               # Format with oxfmt
bun run format:check         # Check formatting without writing
bun test                     # Run unit tests
```

### Cross-compilation

The release workflow compiles binaries for three platforms:

| Target                    | Artifact           |
| ------------------------- | ------------------ |
| macOS ARM (Apple Silicon) | `tm-darwin-arm64`  |
| macOS x86_64 (Intel)      | `tm-darwin-x86_64` |
| Linux x86_64              | `tm-linux-x86_64`  |

Binaries are compiled with `bun build --compile --minify` and distributed as `.tar.gz` archives attached to GitHub Releases.

### Release process

Releases are automated with [release-please](https://github.com/googleapis/release-please):

1. Push commits to `main` using [conventional commit](https://www.conventionalcommits.org/) messages
2. Release-please opens a version-bump PR with an auto-generated changelog
3. Merge the PR to trigger the release pipeline
4. Binaries are built, attached to the GitHub Release, and the Homebrew formula is auto-updated

The formula lives at [`nicknisi/homebrew-formulae`](https://github.com/nicknisi/homebrew-formulae). A reference copy of the formula is also tracked in `Formula/tm.rb` in this repo.

## License

MIT

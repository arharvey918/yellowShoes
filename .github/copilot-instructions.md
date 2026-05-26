# Copilot instructions

## Build, run, and validation

- Do Go work from `src/`; the module root is `src/go.mod`.
- Build the app with `cd src && go build ./...`.
- Run without SDR hardware with `cd src && YELLOWSHOES_SMOKE=1 go run . -t /tmp -p 8113`.
- Run against real radio hardware with `cd src && go run . -t /tmp -p 8113`. `nrsc5` must be on `PATH`; `lame` is additionally required for MP3/iOS playback.
- Run the current test/smoke pass with `cd src && go test ./...`. There are currently no `_test.go` files, so this mainly verifies the package still builds under `go test`.
- Run a single Go test with `cd src && go test ./... -run '^TestName$'`.
- Build release binaries with `cd src && ./make.sh`.
- There is no repository lint script. For Go changes, format touched files with `gofmt -w` or `goimports -w`. `staticcheck ./...` is available in the devcontainer/tooling, but it currently reports pre-existing issues, so treat it as advisory unless you are already repairing nearby legacy code.

## High-level architecture

- `src/` is a single Go server binary that serves both the HTTP API and the frontend. Static files under `src/assets/` are embedded with `//go:embed assets/*`; there is no separate frontend build step or JS framework runtime.
- Playback is session-based. `statusStruct` holds global process/session state, while each live tune is tracked in a `tagStruct`. `/getStream` creates or reuses a session, launches `nrsc5` or the smoke-mode generator, and writes audio into a temp file in `tmpDir`.
- `/getAudio` does not stream directly from the decoder process. It tails the growing temp audio file, applies the live WAV header workaround for WAV playback, and updates heartbeat/connection counters so idle sessions can be reaped.
- Metadata comes from parsing decoder stderr in `tagStruct.infoLoop()`. The frontend polls `/getInfo`, `/getErrMsg`, and `/whatsGoinOn` to update metadata, error output, and the “join active session” state.
- The frontend is the trio `src/assets/page.html`, `src/assets/app.css`, and `src/assets/app.js`. `app.js` owns client state, uses relative fetches to the Go routes, and keeps bookmarks plus playback settings in browser `localStorage`.
- Settings portability is implemented through temporary `.lace` files in `tmpDir`: the browser exports a JSON payload to `/checkSettings`, the backend validates and writes a random `<lace>.lace` file, and `/import` reads it back for another browser/device.

## Key conventions

- Keep the backend/frontend contract stable. The current UI expects plain-text responses from `/getStream`, `"No_Active_Tags"` or a small JSON object from `/whatsGoinOn`, and JSON maps from `/getInfo`, `/checkSettings`, `/import`, and `/valBookMark`.
- Playback cleanup is cross-cutting: sessions are stored in `status.tagMap` by both generated tag and frequency, and cleanup must remove both keys, stop any running process, and delete the temp audio file. If you touch lifecycle logic, review `getStream.go`, `tagOp.go`, `waveShenanigans.go`, and the cleanup paths in `main.go` together.
- iOS support is intentional and split across frontend and backend. The frontend forces MP3 for iOS browsers; the backend only produces MP3 by piping `nrsc5` through `lame`. Smoke mode always skips `nrsc5` and serves generated WAV.
- Reuse the existing validation helpers in `main.go` (`validateFreq`, `validateProg`, `validateBookName`, `portCheck`) instead of introducing parallel request-validation logic.
- Frontend bookmark keys are stored as `freq=<fm>&program=<index>` in `localStorage`, and the Lace import/export flow preserves those keys verbatim.
- Dynamic routes intentionally disable caching, and the frontend appends random query tokens to fetches. Preserve that pattern when adding new polling or playback requests.
- When editing Go files or future Go tests, also follow the repository instruction files in `.github/instructions/`: Effective Go, Go code review comments, and the plain-Go test/comment guidance for `_test.go` files.

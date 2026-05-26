# Apple Container Development

This repository includes an Apple-container-friendly development image and a helper script for the current VS Code workflow.

## Current VS Code support

VS Code's Apple container support is still experimental. The supported workflow today is:

1. Start the container yourself with Apple's `container` CLI.
2. In VS Code, use `Dev Containers: Attach to Running Apple Container...`.
3. Open `/workspaces/yellowShoes` inside the attached container.

There is intentionally no `devcontainer.json` in this repository. Current Apple container support in VS Code does not use it reliably, so the workflow here stays manual and explicit. `.vscode/extensions.json` is still kept so VS Code can recommend the expected extensions.

Automatic port discovery can also miss port `8113`. If that happens, add the port manually in the Ports panel.

For Git operations, the launcher automatically mounts `~/.gitconfig` and `~/.ssh` into `/root` as read-only paths when they exist on your Mac. If `SSH_AUTH_SOCK` is available, it also forwards your SSH agent with `--ssh`.

## Prerequisites

- Apple's `container` CLI installed on macOS.
- VS Code with the Dev Containers extension.
- `dev.containers.experimentalAppleContainerSupport` enabled in VS Code settings.

## Build and run the development container

First time, or after changing the image:

```bash
./.devcontainer/apple-container.sh rebuild
```

To start the existing development container again:

```bash
./.devcontainer/apple-container.sh up
```

Useful maintenance commands:

```bash
./.devcontainer/apple-container.sh stop
./.devcontainer/apple-container.sh rm
./.devcontainer/apple-container.sh build
```

## Run yellowShoes inside the container

Without SDR hardware:

```bash
cd src
YELLOWSHOES_SMOKE=1 go run . -t /tmp -p 8113
```

With `nrsc5` and SDR access configured:

```bash
cd src
go run . -t /tmp -p 8113
```

Open `http://127.0.0.1:8113/main` from macOS after the app starts.

## Tooling included in the image

- Go toolchain
- `nrsc5`
- `lame`
- `gopls`, `goimports`, `dlv`, `staticcheck`
- GitHub Copilot CLI via `@github/copilot`
- `typescript-language-server`
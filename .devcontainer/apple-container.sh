#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

IMAGE_NAME="${APPLE_CONTAINER_IMAGE:-yellowshoes-dev:latest}"
CONTAINER_NAME="${APPLE_CONTAINER_NAME:-yellowshoes-dev}"
HOST_WORKSPACE="${APPLE_CONTAINER_WORKSPACE:-${ROOT_DIR}}"
CONTAINER_WORKSPACE="${APPLE_CONTAINER_WORKSPACE_FOLDER:-/workspaces/yellowShoes}"
CONTAINER_HOME="${APPLE_CONTAINER_HOME:-/root}"
PORT_SPEC="${APPLE_CONTAINER_PORT:-8113:8113}"

usage() {
    cat <<EOF
Usage: $(basename "$0") [build|up|rebuild|stop|rm|logs]

Commands:
  build   Build the Apple container image only.
  up      Recreate the development container from the current image.
  rebuild Build the image and recreate the development container.
  stop    Stop the running development container.
  rm      Stop and delete the development container.
  logs    Show logs from the development container.
EOF
}

append_volume_if_exists() {
        local source_path="$1"
        local target_path="$2"

        if [[ -e "${source_path}" ]]; then
        volume_args+=(--volume "${source_path}:${target_path}:ro")
        fi
}

build_image() {
    container build --file "${SCRIPT_DIR}/Dockerfile" --tag "${IMAGE_NAME}" "${ROOT_DIR}"
}

remove_container() {
    if container inspect "${CONTAINER_NAME}" >/dev/null 2>&1; then
        container stop "${CONTAINER_NAME}" >/dev/null 2>&1 || true
        container delete "${CONTAINER_NAME}" >/dev/null 2>&1 || true
    fi
}

run_container() {
    local ssh_args=()
    local volume_args=()

    append_volume_if_exists "${HOME}/.gitconfig" "${CONTAINER_HOME}/.gitconfig"
    append_volume_if_exists "${HOME}/.ssh" "${CONTAINER_HOME}/.ssh"

    if [[ -n "${SSH_AUTH_SOCK:-}" ]]; then
        ssh_args=(--ssh)
    fi

    container run \
        --detach \
        --name "${CONTAINER_NAME}" \
        --init \
        --workdir "${CONTAINER_WORKSPACE}" \
        --volume "${HOST_WORKSPACE}:${CONTAINER_WORKSPACE}" \
        --publish "${PORT_SPEC}" \
        "${volume_args[@]}" \
        "${ssh_args[@]}" \
        "${IMAGE_NAME}" \
        sleep infinity
}

print_next_steps() {
    cat <<EOF
Apple development container is ready.

Attach from VS Code:
  1. F1 -> Dev Containers: Attach to Running Apple Container...
  2. Choose ${CONTAINER_NAME}
  3. Open ${CONTAINER_WORKSPACE}

If port 8113 is not discovered automatically, add it manually in the Ports panel.
EOF
}

case "${1:-up}" in
    build)
        build_image
        ;;
    up)
        remove_container
        run_container
        print_next_steps
        ;;
    rebuild)
        build_image
        remove_container
        run_container
        print_next_steps
        ;;
    stop)
        if container inspect "${CONTAINER_NAME}" >/dev/null 2>&1; then
            container stop "${CONTAINER_NAME}"
        fi
        ;;
    rm)
        remove_container
        ;;
    logs)
        container logs "${CONTAINER_NAME}"
        ;;
    *)
        usage
        exit 1
        ;;
esac
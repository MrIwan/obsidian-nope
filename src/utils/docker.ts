// Docker-compose invocation wrapper and shared docker constants.
//
// PATH-Note: GUI-launched apps on macOS inherit a minimal PATH that usually
// does not include /usr/local/bin or /opt/homebrew/bin. As a pragmatic first
// step we hardcode the absolute path here. Robust PATH discovery (look in
// known locations, optionally `bash -lc which docker`) is a later iteration.

export const DOCKER_BIN = '/usr/local/bin/docker';
export const DOCKER_IMAGE_NAME = 'obsidian2pdf:latest';

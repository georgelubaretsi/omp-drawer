#!/bin/sh
# Runs the plugin's pinned kagi CLI from any working directory: `scripts/kagi.sh [args...]` is
# `kagi [args...]` through the plugin's bin/launcher, three folders up.
set -eu
here=$(dirname -- "$0") || {
  printf 'kagi.sh: cannot find the folder of %s\n' "$0" >&2
  exit 1
}
exec "$here/../../../bin/launcher" kagi "$@"

#!/bin/sh
# Runs a pinned external tool: `bin/launcher <exe> [args...]` execs <exe> with the args. The build
# (tools/build) copies this file into the bin/ folder of each plugin with a mise.toml, next to
# `pins`, the versions, URLs and sha256 sums it reads from the plugin's mise.lock.
#
# Resolution, first match:
#   1. $<EXE>_BIN (the name uppercased, `-` and `.` as `_`), e.g. KAGI_BIN;
#   2. <exe> on PATH whose `--version` output has the pinned version as a whole word;
#   3. the cached copy, <data>/tools/<exe>/<version>/<platform>/<exe>;
#   4. a download of the pinned build, run only once its sha256 matches, then cached.
# <data> is $PLUGIN_DATA, else $CLAUDE_PLUGIN_DATA, else
# ${XDG_CACHE_HOME:-$HOME/.cache}/omp-drawer/<plugin folder name>.
#
# Never writes to stdout: MCP stdio servers start through it. Messages go to stderr. Exit status:
# the tool's own, 127 for an exe without a pin (or none for this platform), 1 for other failures.
set -eu

fail() {
  code=$1
  shift
  printf 'launcher: %s\n' "$*" >&2
  exit "$code"
}
die() { fail 1 "$@"; }

[ $# -ge 1 ] || fail 2 "usage: launcher <exe> [args...]"
exe=$1
shift
here=$(dirname -- "$0") || die "cannot find the folder of $0"
pins=$here/pins
[ -r "$pins" ] || die "$pins is missing; rebuild the plugin (bun tools/build.ts)"

# Names are also environment variable and file names; the build accepts only these.
case $exe in
  [A-Za-z]*) case $exe in *[!A-Za-z0-9._-]*) fail 127 "no pin for \"$exe\" in $pins" ;; esac ;;
  *) fail 127 "no pin for \"$exe\" in $pins" ;;
esac

os=$(uname -s) || die "uname -s failed"
arch=$(uname -m) || die "uname -m failed"
case $os in
  Darwin) os=macos ;;
  Linux) os=linux ;;
esac
case $arch in
  arm64 | aarch64) arch=arm64 ;;
  x86_64 | amd64) arch=x64 ;;
esac
platform=$os-$arch

# pins: <exe> TAB <version> TAB <platform> TAB <url> TAB <sha256>, after a `#` header line.
tab=$(printf '\t')
version='' url='' sum=''
while IFS=$tab read -r p_exe p_version p_platform p_url p_sum; do
  [ "$p_exe" = "$exe" ] || continue
  version=$p_version
  [ "$p_platform" != "$platform" ] || {
    url=$p_url
    sum=$p_sum
  }
done <"$pins"
[ -n "$version" ] || fail 127 "no pin for \"$exe\" in $pins"

# 1. An explicit binary.
var=$(
  tr 'a-z.-' 'A-Z__' <<EOF
$exe
EOF
) || die "tr failed"
eval "override=\${${var}_BIN:-}"
[ -z "$override" ] || exec "$override" "$@"

# 2. The pinned version on PATH. stdin stays with the tool: the probe reads /dev/null.
if found=$(command -v -- "$exe"); then
  out=$("$found" --version </dev/null 2>&1) || out=''
  words=$(
    tr -c 'A-Za-z0-9._+-' ' ' <<EOF
$out
EOF
  ) || die "tr failed"
  case " $words " in
    *" $version "* | *" v$version "*) exec "$found" "$@" ;;
  esac
  other=''
  for w in $words; do
    case $w in [0-9]*.* | v[0-9]*.*)
      other=$w
      break
      ;;
    esac
  done
  echo "launcher: skipping $found: it reports version ${other:-(none found)}, the pin is $version" >&2
fi

# 3. The cached copy.
case $platform in
  macos-arm64 | macos-x64 | linux-arm64 | linux-x64) ;;
  *) die "unsupported platform: $(uname -s) $(uname -m); set ${var}_BIN to a $exe $version binary" ;;
esac
[ -n "$url" ] || fail 127 "$exe $version has no build pinned for $platform in $pins"
data=${PLUGIN_DATA:-${CLAUDE_PLUGIN_DATA:-}}
if [ -z "$data" ]; then
  plugin=$(cd -- "$here/.." && pwd) || die "cannot find the plugin folder of $0"
  data=${XDG_CACHE_HOME:-$HOME/.cache}/omp-drawer/${plugin##*/}
fi
# Absolute, so no path below can be read as an option.
case $data in /*) ;; *) data=$PWD/$data ;; esac
cache=$data/tools/$exe/$version/$platform/$exe
[ ! -f "$cache" ] || [ ! -x "$cache" ] || exec "$cache" "$@"

# 4. Download into a temp folder next to the cache (same filesystem: the final move is a rename),
# verify, extract, and move the binary into place.
echo "launcher: downloading $exe $version for $platform" >&2
mkdir -p -- "$data/tools" || die "cannot create $data/tools"
tmp=$(mktemp -d "$data/tools/.download.XXXXXX") || die "cannot create a temp folder in $data/tools"
trap 'rm -rf -- "$tmp"' EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

curl -fsSL -o "$tmp/asset" -- "$url" || die "download failed: $url"
if command -v sha256sum >/dev/null 2>&1; then
  actual=$(sha256sum -- "$tmp/asset") || die "sha256sum failed"
elif command -v shasum >/dev/null 2>&1; then
  actual=$(shasum -a 256 -- "$tmp/asset") || die "shasum failed"
else
  die "needs sha256sum or shasum to verify the download"
fi
actual=${actual%% *}
[ "$actual" = "$sum" ] || die "checksum mismatch for $url: expected sha256 $sum, got $actual; not running it"

mkdir -- "$tmp/x" || die "cannot create $tmp/x"
# The forms ARCHIVE_SUFFIXES in tools/build/tools.ts lists; the build refuses other packed URLs.
case $url in
  *.tar.gz | *.tgz) tar -xzf "$tmp/asset" -C "$tmp/x" >&2 || die "cannot extract $url" ;;
  *.tar.xz) tar -xJf "$tmp/asset" -C "$tmp/x" >&2 || die "cannot extract $url" ;;
  *.zip) unzip -q "$tmp/asset" -d "$tmp/x" >&2 || die "cannot extract $url" ;;
  *) mv -- "$tmp/asset" "$tmp/x/$exe" || die "cannot move the download" ;;
esac
find "$tmp/x" -type f -name "$exe" >"$tmp/found" || die "cannot search the extracted files"
bin=''
read -r bin <"$tmp/found" || [ -n "$bin" ] || die "$url holds no file named $exe"
# No `--`: BSD chmod takes the first operand after it as the mode. $bin is absolute.
chmod +x "$bin" || die "cannot make $bin executable"
mkdir -p -- "${cache%/*}" || die "cannot create ${cache%/*}"
mv -f -- "$bin" "$cache" || die "cannot move $exe into $cache"
rm -rf -- "$tmp"
trap - EXIT
exec "$cache" "$@"

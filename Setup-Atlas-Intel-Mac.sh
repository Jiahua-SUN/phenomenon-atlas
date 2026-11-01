#!/bin/sh
# Intel Macs use current conda-forge PyTorch builds because PyPI no longer has them.
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
export MAMBA_ROOT_PREFIX="$PWD/.runtime/mamba"
export UV_CACHE_DIR="$PWD/.runtime/uv-cache"
export HF_HUB_OFFLINE=1
export HF_HUB_DISABLE_TELEMETRY=1
TOOLS="$PWD/.runtime/tools"
ENV="$PWD/.runtime/intel-env"
STAMP="$PWD/.runtime/intel-install.sha256"
EXPECTED=$(shasum -a 256 intel-macos-conda.lock intel-macos-pip.lock | shasum -a 256 | awk '{print $1}')
if [ ! -x "$ENV/bin/python" ] || [ ! -f "$STAMP" ] || [ "$(cat "$STAMP")" != "$EXPECTED" ]; then
  if [ "${UV_OFFLINE:-0}" = 1 ]; then
    echo 'The Intel Mac environment needs installation. Start once with internet access.' >&2
    exit 1
  fi
  mkdir -p "$TOOLS"
  if [ ! -x "$TOOLS/bin/micromamba" ]; then
    echo 'Downloading the Intel Mac environment manager from conda-forge...'
    ARCHIVE="$TOOLS/micromamba-osx-64-2.10.0.tar.bz2"
    curl --fail --location --silent --show-error https://conda.anaconda.org/conda-forge/osx-64/micromamba-2.10.0-0.tar.bz2 -o "$ARCHIVE"
    printf '%s  %s\n' '17b20c4271d65c030a5c86788f5ca86eb575187209f626edabdb8c6a875c6838' "$ARCHIVE" | shasum -a 256 -c -
    tar -xjf "$ARCHIVE" -C "$TOOLS" bin/micromamba
  fi
  echo 'Preparing the locked Intel Mac environment. First launch needs internet access.'
  "$TOOLS/bin/micromamba" create --no-rc --yes --prefix "$ENV" --file intel-macos-conda.lock
  "$TOOLS/uv" pip install --python "$ENV/bin/python" --no-deps --require-hashes -r intel-macos-pip.lock
  "$TOOLS/uv" pip check --python "$ENV/bin/python"
  printf '%s\n' "$EXPECTED" > "$STAMP"
fi
exec "$ENV/bin/python" -X utf8 -I launch.py "$@"

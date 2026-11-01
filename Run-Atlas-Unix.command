#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
export UV_CACHE_DIR="$PWD/.runtime/uv-cache"
export UV_PYTHON_INSTALL_DIR="$PWD/.runtime/python"
export UV_UNMANAGED_INSTALL="$PWD/.runtime/tools"
export UV_NO_MODIFY_PATH=1
mkdir -p "$UV_UNMANAGED_INSTALL"
if [ ! -x "$UV_UNMANAGED_INSTALL/uv" ]; then
  echo 'Downloading the Python environment manager from Astral...'
  curl --fail --location --silent --show-error https://astral.sh/uv/0.13.6/install.sh -o .runtime/uv-installer.sh
  sh .runtime/uv-installer.sh
fi
echo 'Preparing the local environment. First launch needs an internet connection.'
exec "$UV_UNMANAGED_INSTALL/uv" run --locked --managed-python --python 3.13 python -X utf8 -I launch.py "$@"

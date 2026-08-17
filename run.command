#!/bin/zsh
set -euo pipefail

script_dir="${0:A:h}"
cd "$script_dir"

if [[ ! -x .venv/bin/python ]]; then
  python3 -m venv .venv
  .venv/bin/python -m pip install --upgrade pip
  .venv/bin/python -m pip install -r requirements.txt
fi

(sleep 1; open "http://127.0.0.1:8765") &
exec .venv/bin/python app.py

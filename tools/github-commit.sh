#!/usr/bin/env bash
# Commit e push dei soli file indicati, se cambiati. Se nel frattempo il repository è cambiato,
# riparte da origin/main rimettendo i file (niente merge). Usato da .github/workflows/aggiorna-arrivi.yml.
set -euo pipefail
msg="$1"; shift
files=()
for f in "$@"; do [ -f "$f" ] && files+=("$f"); done
[ ${#files[@]} -eq 0 ] && exit 0
git add -- "${files[@]}"
git diff --cached --quiet && exit 0
git config user.name "github-actions[bot]"
git config user.email "41898333+github-actions[bot]@users.noreply.github.com"
tmp=$(mktemp -d)
cp -- "${files[@]}" "$tmp/"
for i in 1 2 3 4; do
  git commit -q -m "$msg" || true
  git push -q origin HEAD:main && exit 0
  sleep $((i * 4))
  git fetch -q origin main
  git reset -q --hard origin/main
  for f in "${files[@]}"; do cp "$tmp/$(basename "$f")" "$f"; done
  git add -- "${files[@]}"
  git diff --cached --quiet && exit 0
done
echo "push non riuscito dopo 4 tentativi" >&2
exit 1

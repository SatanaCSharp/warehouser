#!/usr/bin/env sh
#
# Runs deny-git-hook-bypass.sh over every row of bypass-samples.tsv and reports the rows whose
# verdict disagrees with the fixture. Exits non-zero on the first disagreement, so it can be used
# as a gate after any change to the bypass pattern.
set -eu

here=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
guard="$here/deny-git-hook-bypass.sh"
samples="$here/bypass-samples.tsv"
failures=0
checked=0

while IFS='	' read -r expected invoked; do
  case "$expected" in
    '' | \#*) continue ;;
  esac

  if "$guard" --check "$invoked" 2>/dev/null; then
    actual=allow
  else
    actual=deny
  fi

  checked=$((checked + 1))

  if [ "$actual" != "$expected" ]; then
    failures=$((failures + 1))
    printf '%s\n' "expected $expected, got $actual: $invoked" >&2
  fi
done <"$samples"

if [ "$failures" -ne 0 ]; then
  printf '%s\n' "$failures of $checked sample commands classified wrongly" >&2
  exit 1
fi

printf '%s\n' "$checked sample commands classified as the fixture expects"

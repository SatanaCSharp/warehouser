#!/usr/bin/env bash
#
# Mirror docs/system into the writing-app-code skill's references and verify the copy.
#
# docs/system is the source of truth. This script never writes to it; it only copies out of it,
# byte for byte, so an installed copy of the skill carries the same instructions the repository
# keeps under docs/. A drift between the two is always resolved by re-running the sync, never by
# editing a mirrored file.
#
# Usage:
#   sync-references.sh            copy docs/system -> references/docs-system and rewrite the manifest
#   sync-references.sh --check    verify the mirror matches docs/system; exit 1 on any drift
#   sync-references.sh --help

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd -- "${SKILL_DIR}/../../.." && pwd)"

SOURCE_DIR="${REPO_ROOT}/docs/system"
MIRROR_DIR="${SKILL_DIR}/references/docs-system"
MANIFEST="${SKILL_DIR}/references/docs-system.sha256"

usage() {
  sed -n '3,14p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

hash_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | cut -d' ' -f1
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    echo "sync-references.sh: neither shasum nor sha256sum is available" >&2
    exit 2
  fi
}

# Every file under docs/system, relative to it, sorted so the manifest is stable.
list_sources() {
  (cd "${SOURCE_DIR}" && find . -type f ! -name '.DS_Store' | sed 's|^\./||' | LC_ALL=C sort)
}

list_mirrored() {
  [ -d "${MIRROR_DIR}" ] || return 0
  (cd "${MIRROR_DIR}" && find . -type f ! -name '.DS_Store' | sed 's|^\./||' | LC_ALL=C sort)
}

build_manifest() {
  local rel
  while IFS= read -r rel; do
    [ -n "${rel}" ] || continue
    printf '%s  %s\n' "$(hash_file "${SOURCE_DIR}/${rel}")" "${rel}"
  done < <(list_sources)
}

MODE="sync"
case "${1-}" in
  --check) MODE="check" ;;
  --help | -h)
    usage
    exit 0
    ;;
  "") ;;
  *)
    echo "sync-references.sh: unknown argument '$1'" >&2
    usage >&2
    exit 2
    ;;
esac

if [ ! -d "${SOURCE_DIR}" ]; then
  echo "sync-references.sh: ${SOURCE_DIR} does not exist" >&2
  exit 2
fi

added=0
updated=0
removed=0
drift=0

if [ "${MODE}" = "check" ]; then
  while IFS= read -r rel; do
    [ -n "${rel}" ] || continue
    if [ ! -f "${MIRROR_DIR}/${rel}" ]; then
      echo "MISSING  references/docs-system/${rel}  (docs/system/${rel} is not mirrored)"
      drift=$((drift + 1))
    elif [ "$(hash_file "${SOURCE_DIR}/${rel}")" != "$(hash_file "${MIRROR_DIR}/${rel}")" ]; then
      echo "STALE    references/docs-system/${rel}  (differs from docs/system/${rel})"
      drift=$((drift + 1))
    fi
  done < <(list_sources)

  while IFS= read -r rel; do
    [ -n "${rel}" ] || continue
    if [ ! -f "${SOURCE_DIR}/${rel}" ]; then
      echo "ORPHAN   references/docs-system/${rel}  (no such file under docs/system)"
      drift=$((drift + 1))
    fi
  done < <(list_mirrored)

  if [ ! -f "${MANIFEST}" ]; then
    echo "MISSING  references/docs-system.sha256"
    drift=$((drift + 1))
  elif ! diff -q <(build_manifest) "${MANIFEST}" >/dev/null 2>&1; then
    echo "STALE    references/docs-system.sha256  (does not match docs/system)"
    drift=$((drift + 1))
  fi

  if [ "${drift}" -gt 0 ]; then
    echo
    echo "${drift} difference(s). Run ai/skills/writing-app-code/scripts/sync-references.sh to resync,"
    echo "then reconcile references/web-manifest.md and references/server-manifest.md by hand."
    exit 1
  fi

  echo "references/docs-system is in sync with docs/system ($(list_sources | wc -l | tr -d ' ') files)."
  exit 0
fi

mkdir -p "${MIRROR_DIR}"

while IFS= read -r rel; do
  [ -n "${rel}" ] || continue
  mkdir -p "${MIRROR_DIR}/$(dirname "${rel}")"
  if [ ! -f "${MIRROR_DIR}/${rel}" ]; then
    cp "${SOURCE_DIR}/${rel}" "${MIRROR_DIR}/${rel}"
    echo "added    references/docs-system/${rel}"
    added=$((added + 1))
  elif ! cmp -s "${SOURCE_DIR}/${rel}" "${MIRROR_DIR}/${rel}"; then
    cp "${SOURCE_DIR}/${rel}" "${MIRROR_DIR}/${rel}"
    echo "updated  references/docs-system/${rel}"
    updated=$((updated + 1))
  fi
done < <(list_sources)

while IFS= read -r rel; do
  [ -n "${rel}" ] || continue
  if [ ! -f "${SOURCE_DIR}/${rel}" ]; then
    rm "${MIRROR_DIR}/${rel}"
    echo "removed  references/docs-system/${rel}"
    removed=$((removed + 1))
  fi
done < <(list_mirrored)

# Drop directories the removals emptied.
find "${MIRROR_DIR}" -type d -empty -delete 2>/dev/null || true
mkdir -p "${MIRROR_DIR}"

build_manifest >"${MANIFEST}"

total="$(list_sources | wc -l | tr -d ' ')"
echo
echo "mirrored ${total} file(s) from docs/system: ${added} added, ${updated} updated, ${removed} removed."
if [ "$((added + updated + removed))" -gt 0 ]; then
  echo "Reconcile references/web-manifest.md and references/server-manifest.md with the changed documents."
fi

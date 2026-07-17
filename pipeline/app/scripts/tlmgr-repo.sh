# tlmgr-repo.sh: resolve the tlmgr repository URL for the image's TeX Live year.
#
# CTAN only serves the current TeX Live release, so a version-pinned image needs
# the frozen historic tlnet-final repo of its own year. That repo only appears
# once the year is frozen: while the image's year IS the current release the
# historic URL 404s and every install limps through the callers' slow fallback
# path. So probe the repo first and return plain CTAN when it is not there yet.
# Callers keep their own fallback as a safety net.
#
# Single source for this resolution. Sourced by build.sh (runtime nope-tlmgr
# installs) and by the Dockerfile base-package layer (image build).

nope_tlmgr_repo() {
  year=$(tlmgr version | sed -n 's/.*version \([0-9]\{4\}\).*/\1/p')
  repo="https://ftp.math.utah.edu/pub/tex/historic/systems/texlive/${year}/tlnet-final"
  probe="$repo/tlpkg/texlive.tlpdb"
  if command -v curl >/dev/null 2>&1; then
    curl -fsIL --max-time 20 "$probe" >/dev/null 2>&1 ||
      repo="https://mirror.ctan.org/systems/texlive/tlnet"
  elif command -v wget >/dev/null 2>&1; then
    wget -q --spider --timeout=20 --tries=1 "$probe" >/dev/null 2>&1 ||
      repo="https://mirror.ctan.org/systems/texlive/tlnet"
  fi
  echo "$repo"
}

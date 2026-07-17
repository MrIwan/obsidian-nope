# tlmgr-repo.sh: resolve the tlmgr repository URL for the image's TeX Live year.
#
# CTAN only serves the current TeX Live release, so a version-pinned image needs
# the frozen historic tlnet-final repo of its own year. Callers keep plain CTAN
# as a fallback for as long as the pinned release is still current.
#
# Single source for this resolution. Sourced by build.sh (runtime nope-tlmgr
# installs) and by the Dockerfile base-package layer (image build).

nope_tlmgr_repo() {
  year=$(tlmgr version | sed -n 's/.*version \([0-9]\{4\}\).*/\1/p')
  echo "https://ftp.math.utah.edu/pub/tex/historic/systems/texlive/${year}/tlnet-final"
}

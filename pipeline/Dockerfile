# --- Stage 1: merman
FROM rust:1-bookworm AS merman-builder
RUN cargo install merman-cli --locked --version 0.7.0

# --- Stage 2: Pipeline-Image --------------------------------------------------
# FROM pandoc/extra:3.9.0.0-debian
FROM pandoc/extra:3.9.0.2-debian
# Links the GHCR package to the repo; NOPE_IMAGE_TAG is only consumed by
# Dockerfile.pull, declared here so compose can pass it without a warning.
LABEL org.opencontainers.image.source="https://github.com/MrIwan/obsidian-nope"
ARG NOPE_IMAGE_TAG=""
# bash für unser build.sh — Alpine-Base hat nur /bin/sh.
RUN apt update && apt upgrade -y && apt install bash fonts-freefont-ttf latexmk -y

# merman-CLI (mmdc-kompatible Flags: -i/-o/-b/-s). Der Smoke-Test lässt den
# Build laut scheitern, falls das Rendering je bricht — gleiches Muster wie
# der kpsewhich-Check unten.
COPY --from=merman-builder /usr/local/cargo/bin/merman-cli /usr/local/bin/merman-cli
RUN printf 'flowchart LR\n  A-->B\n' > /tmp/smoke.mmd && \
    merman-cli render -i /tmp/smoke.mmd -o /tmp/smoke.png -b transparent -s 2 && \
    rm /tmp/smoke.mmd /tmp/smoke.png

# Repo resolution is shared with build.sh via tlmgr-repo.sh (nope_tlmgr_repo).
# update --self runs against the resolved repo before the install: the base
# image's tlmgr lags behind CTAN (current year) or behind tlnet-final (frozen
# year), and an outdated tlmgr refuses to install. `|| true` keeps a flaky
# update from killing the build — the kpsewhich check at the end verifies the
# install, because tlmgr can exit 0 without installing and BuildKit would then
# cache the broken layer. Add new packages to this check.
COPY app/scripts/tlmgr-repo.sh /usr/local/lib/nope/tlmgr-repo.sh
RUN . /usr/local/lib/nope/tlmgr-repo.sh && repo="$(nope_tlmgr_repo)" && \
    { tlmgr --repository "$repo" update --self || true; } && \
    tlmgr --repository "$repo" install \
        glossaries \
        ragged2e \
        awesomebox \
        svg \
        background \
        setspace && \
    kpsewhich ragged2e.sty glossaries.sty awesomebox.sty svg.sty background.sty setspace.sty
ENTRYPOINT []
WORKDIR /build

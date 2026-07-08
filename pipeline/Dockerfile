# --- Stage 1: merman
FROM rust:1-bookworm AS merman-builder
RUN cargo install merman-cli --locked --version 0.7.0

# --- Stage 2: Pipeline-Image --------------------------------------------------
# FROM pandoc/extra:3.9.0.0-debian
FROM pandoc/extra:3.9.0.2-debian
# bash für unser build.sh — Alpine-Base hat nur /bin/sh.
RUN apt update && apt upgrade -y && apt install bash fonts-freefont-ttf latexmk -y

# merman-CLI (mmdc-kompatible Flags: -i/-o/-b/-s). Der Smoke-Test lässt den
# Build laut scheitern, falls das Rendering je bricht — gleiches Muster wie
# der kpsewhich-Check unten.
COPY --from=merman-builder /usr/local/cargo/bin/merman-cli /usr/local/bin/merman-cli
RUN printf 'flowchart LR\n  A-->B\n' > /tmp/smoke.mmd && \
    merman-cli render -i /tmp/smoke.mmd -o /tmp/smoke.png -b transparent -s 2 && \
    rm /tmp/smoke.mmd /tmp/smoke.png

# kpsewhich am Ende verifiziert die Installation
RUN tlmgr update --self && \
    tlmgr install \
        glossaries \
        ragged2e \
        awesomebox \
        svg \
        background \
        setspace && \
    kpsewhich ragged2e.sty glossaries.sty awesomebox.sty svg.sty background.sty setspace.sty
ARG EXTRA_TLMGR_PACKAGES=""
RUN if [ -n "$EXTRA_TLMGR_PACKAGES" ]; then \
        tlmgr install $EXTRA_TLMGR_PACKAGES && \
        for p in $EXTRA_TLMGR_PACKAGES; do \
            tlmgr info --only-installed --data name "$p" | grep -qx "$p"; \
        done; \
    fi
ENTRYPOINT []
WORKDIR /build

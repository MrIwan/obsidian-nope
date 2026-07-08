# FROM pandoc/extra:3.9.0.0-debian
FROM pandoc/extra:3.9.0.2-debian
# bash für unser build.sh — Alpine-Base hat nur /bin/sh.
# nodejs/npm + chromium für mermaid-cli
RUN apt update && apt upgrade -y && apt install bash nodejs npm fonts-freefont-ttf latexmk curl -y

# Chromium gepinnt auf 149 via snapshot.debian.org (unveränderliches Archiv):
ARG TARGETARCH
RUN set -e; \
    case "$TARGETARCH" in \
      arm64) C=4efecfdc1ee9bf336a00d54eef14edb758cc4707; CC=117f067b4202829708beac06b294dba37430ee5d; CS=b1a90ca0c4ac453c77a166ab25ac53727267d86b ;; \
      *)     C=b7b0674e68b94af0158bfa8c305a46fc07f6f7c5; CC=098ec4a8fe2e76c66f942ad2e2133f75fbd2a13d; CS=48701ce3ed3bd9cf6008862fb67d6decc3cc6569 ;; \
    esac; \
    mkdir -p /tmp/chromium && cd /tmp/chromium && \
    curl -fsSL -o chromium.deb         "https://snapshot.debian.org/file/$C" && \
    curl -fsSL -o chromium-common.deb  "https://snapshot.debian.org/file/$CC" && \
    curl -fsSL -o chromium-sandbox.deb "https://snapshot.debian.org/file/$CS" && \
    apt-get update && \
    apt-get install -y ./chromium-common.deb ./chromium.deb ./chromium-sandbox.deb && \
    apt-mark hold chromium chromium-common chromium-sandbox && \
    cd / && rm -rf /tmp/chromium && \
    chromium --headless --no-sandbox --disable-gpu --disable-dev-shm-usage --dump-dom about:blank > /dev/null

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
RUN test -x "$PUPPETEER_EXECUTABLE_PATH"
# In Container als root → Chromium braucht --no-sandbox.
# --disable-gpu: kein /dev/dri im Container (WSL2-Crash); --disable-dev-shm-usage: 64MB-Default-/dev/shm reicht Chromium nicht.
RUN mkdir -p /etc/mmdc && \
    printf '{ "args": ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] }\n' \
      > /etc/mmdc/puppeteer-config.json
RUN npm install -g @mermaid-js/mermaid-cli@10.9.1
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

# FROM pandoc/extra:3.9.0.0-debian
FROM pandoc/extra:3.9.0.2-debian
# bash für unser build.sh — Alpine-Base hat nur /bin/sh.
# nodejs/npm + chromium für mermaid-cli
RUN apt update && apt upgrade -y && apt install bash nodejs npm chromium fonts-freefont-ttf latexmk -y

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

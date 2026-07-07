# FROM pandoc/extra:3.9.0.0-debian
FROM pandoc/extra:3.9.0.2-debian
# bash für unser build.sh — Alpine-Base hat nur /bin/sh.
# curl für NodeSource; chromium für mermaid-cli
RUN apt update && apt upgrade -y && apt install bash curl chromium fonts-freefont-ttf latexmk -y

# Node 22 via NodeSource statt Debian-Node-18 — aktuelles mermaid-cli/puppeteer verlangt Node >=22.
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt install -y nodejs && \
    node --version | grep -q "^v22\."

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
RUN test -x "$PUPPETEER_EXECUTABLE_PATH"
# In Container als root → Chromium braucht --no-sandbox.
# --disable-gpu: kein /dev/dri im Container (WSL2-Crash); --disable-dev-shm-usage: 64MB-Default-/dev/shm reicht Chromium nicht.
RUN mkdir -p /etc/mmdc && \
    printf '{ "args": ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] }\n' \
      > /etc/mmdc/puppeteer-config.json
# Major gepinnt — ungepinnte Builds driften zwischen Maschinen (verifiziert: puppeteer-25-auf-node-18-Bruch).
RUN npm install -g @mermaid-js/mermaid-cli@11
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
ENTRYPOINT []
WORKDIR /build

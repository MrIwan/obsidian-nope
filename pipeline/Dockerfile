# FROM pandoc/extra:3.9.0.0-debian
FROM pandoc/extra:3.9.0.2-debian
# bash für unser build.sh — Alpine-Base hat nur /bin/sh.
# nodejs/npm + chromium für mermaid-cli
RUN apt update && apt upgrade -y && apt install bash nodejs npm chromium fonts-freefont-ttf latexmk -y
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
# In Container als root → Chromium braucht --no-sandbox.
RUN mkdir -p /etc/mmdc && \
    printf '{ "args": ["--no-sandbox", "--disable-setuid-sandbox"] }\n' \
      > /etc/mmdc/puppeteer-config.json
RUN npm install -g @mermaid-js/mermaid-cli
# kpsewhich am Ende verifiziert die Installation: tlmgr kann mit Exit 0
# scheitern (z.B. beim TeX-Live-Release-Wechsel) -- ohne den Check cacht
# BuildKit dann einen Layer OHNE die Pakete als Erfolg.
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

FROM --platform=linux/amd64 pandoc/extra:latest

# bash für unser build.sh — Alpine-Base hat nur /bin/sh.
# nodejs/npm + chromium für mermaid-cli
RUN apk add --no-cache bash nodejs npm chromium ttf-freefont

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# In Container als root → Chromium braucht --no-sandbox.
RUN mkdir -p /etc/mmdc && \
    printf '{ "args": ["--no-sandbox", "--disable-setuid-sandbox"] }\n' \
      > /etc/mmdc/puppeteer-config.json

RUN npm install -g @mermaid-js/mermaid-cli

RUN tlmgr install \
    glossaries \
    ragged2e \
    awesomebox \
    svg \
    background

ENTRYPOINT []
WORKDIR /build

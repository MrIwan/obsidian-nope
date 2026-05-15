FROM --platform=linux/amd64 pandoc/extra:latest

# bash for unser build.sh — Alpine-Base only provides /bin/sh
RUN apk add --no-cache bash

RUN tlmgr install \
    glossaries \
    ragged2e \
    awesomebox \
    svg \
    background

ENTRYPOINT []
WORKDIR /build
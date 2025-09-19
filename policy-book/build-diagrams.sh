#!/bin/sh

set -eu

find src -name '*.diagram' -print0 | xargs -0 -n 1 railroad

CS_DIAGRAMS=$(cat cheatsheet-order | sed -e 's/\(.*\)/src\/\1.diagram/')
echo $CS_DIAGRAMS
cat $CS_DIAGRAMS | railroad > cheatsheet.svg

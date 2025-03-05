#!/bin/bash

# This will update the markdown file links to become Jekyll urls. These are used in the Jekyll site to link to other markdown files.
# This script is used in GitHub actions to update the markdown specs in the docs folder.

echo "Update markdown links in specs for Jekyll.."
cd docs
for f in $(ls | sort -V); do
    echo $f
    # Note that -i '' is required for MacOS. It is not required for Linux. See https://stackoverflow.com/a/5694430
    sed -E -i 's#(\(\/)(docs\/[^[:space:]]*\.md)(\#[^[:space:]]*)*(\))#({% link \2 %}\3)#g' $f
done

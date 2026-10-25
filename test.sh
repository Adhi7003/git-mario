#!/bin/sh
# Headless tests using macOS's built-in JavaScriptCore (no Node needed).
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc
cd "$(dirname "$0")" && "$JSC" -m tests/levels.mjs

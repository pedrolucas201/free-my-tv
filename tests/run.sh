#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test_out="$(mktemp -d)"
trap 'rm -rf "$test_out"' EXIT
javac -d "$test_out" app/src/io/freemytv/RecommendationRail.java tests/RecommendationRailTest.java
java -cp "$test_out" io.freemytv.RecommendationRailTest
node tests/recommendations.test.cjs
node --check web/home.js
node --check web/data.js

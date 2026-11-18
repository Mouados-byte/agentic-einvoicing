#!/usr/bin/env bash
# Generates public/voiceover/<id>.wav from voiceover.json with Piper (local TTS, CC0 "joe" voice)
# and writes src/voiceover-durations.json for the composition timing.
set -euo pipefail
cd "$(dirname "$0")/.."
PIPER=${PIPER:-$HOME/.local/share/piper-venv/bin/piper}
VOICE=${VOICE:-$HOME/.local/share/piper-voices/en_US-joe-medium.onnx}
mkdir -p public/voiceover
node -e 'for (const s of require("./voiceover.json")) console.log(s.id + "\t" + s.text)' |
while IFS=$'\t' read -r id text; do
  printf '%s' "$text" | "$PIPER" -m "$VOICE" -f "public/voiceover/$id.wav" --sentence-silence 0.25 >/dev/null 2>&1
done
node -e '
const fs = require("fs");
const out = {};
for (const {id} of require("./voiceover.json")) {
  const b = fs.readFileSync(`public/voiceover/${id}.wav`);
  const byteRate = b.readUInt32LE(28);
  let o = 12; while (b.toString("ascii", o, o + 4) !== "data") o += 8 + b.readUInt32LE(o + 4);
  out[id] = +(b.readUInt32LE(o + 4) / byteRate).toFixed(2);
}
fs.writeFileSync("src/voiceover-durations.json", JSON.stringify(out, null, 2) + "\n");
console.log(out);'

#!/usr/bin/env bash
set -euo pipefail

# Regenerate the Material Symbols subset from the audited icon-name manifest.
# Requires: fontTools with Brotli support (pip install fonttools brotli)

MANIFEST=scripts/material-symbols-manifest.txt
INPUT=public/fonts/material-symbols-outlined.woff2
OUTPUT=public/fonts/material-symbols-outlined-subset.woff2

if [[ ! -f "$INPUT" ]]; then
  echo "Input font not found: $INPUT" >&2
  exit 1
fi

TEXT_FILE=$(mktemp "${TMPDIR:-/tmp}/material-symbols-text.XXXXXX")
GLYPH_FILE=$(mktemp "${TMPDIR:-/tmp}/material-symbols-glyphs.XXXXXX")
SUBSET_FILE=$(mktemp "${OUTPUT}.XXXXXX")
trap 'rm -f "$TEXT_FILE" "$GLYPH_FILE" "$SUBSET_FILE"' EXIT

python3 - "$INPUT" "$MANIFEST" "$TEXT_FILE" "$GLYPH_FILE" <<'PY'
import sys
from fontTools.ttLib import TTFont

font_path, manifest_path, text_path, glyph_path = sys.argv[1:]
icons = [
    line.strip()
    for line in open(manifest_path, encoding="utf-8")
    if line.strip() and not line.lstrip().startswith("#")
]
font = TTFont(font_path)
cmap = font.getBestCmap()
ligatures = {}

for record in font["GSUB"].table.FeatureList.FeatureRecord:
    if record.FeatureTag != "rlig":
        continue
    for lookup_index in record.Feature.LookupListIndex:
        lookup = font["GSUB"].table.LookupList.Lookup[lookup_index]
        for extension in lookup.SubTable:
            subtable = getattr(extension, "ExtSubTable", extension)
            if not hasattr(subtable, "ligatures"):
                continue
            for first_glyph, entries in subtable.ligatures.items():
                for entry in entries:
                    ligatures[(first_glyph, *entry.Component)] = entry.LigGlyph

targets = []
missing = []
for icon in icons:
    sequence = tuple(cmap.get(ord(char)) for char in icon)
    target = ligatures.get(sequence) if None not in sequence else None
    if target is None:
        missing.append(icon)
    else:
        targets.append(target)

if missing:
    raise SystemExit("Manifest icons missing from the source font: " + ", ".join(missing))

with open(text_path, "w", encoding="utf-8") as text_file:
    text_file.write("\n".join(icons))
with open(glyph_path, "w", encoding="utf-8") as glyph_file:
    glyph_file.write("\n".join(sorted(set(targets))))

print(f"Validated {len(icons)} manifest icons against the source font.")
PY

if command -v pyftsubset >/dev/null 2>&1; then
  pyftsubset "$INPUT" \
    --text-file="$TEXT_FILE" \
    --glyphs-file="$GLYPH_FILE" \
    --output-file="$SUBSET_FILE" \
    --flavor=woff2 \
    --layout-features=rlig \
    --no-layout-closure \
    --glyph-names \
    --symbol-cmap \
    --legacy-cmap \
    --notdef-glyph \
    --notdef-outline \
    --recommended-glyphs \
    --name-IDs='*' \
    --name-legacy \
    --name-languages='*' \
    --no-hinting
else
  python3 -m fontTools.subset "$INPUT" \
    --text-file="$TEXT_FILE" \
    --glyphs-file="$GLYPH_FILE" \
    --output-file="$SUBSET_FILE" \
    --flavor=woff2 \
    --layout-features=rlig \
    --no-layout-closure \
    --glyph-names \
    --symbol-cmap \
    --legacy-cmap \
    --notdef-glyph \
    --notdef-outline \
    --recommended-glyphs \
    --name-IDs='*' \
    --name-legacy \
    --name-languages='*' \
    --no-hinting
fi

python3 - "$INPUT" "$SUBSET_FILE" "$MANIFEST" <<'PY'
import sys
from fontTools.ttLib import TTFont

source_path, subset_path, manifest_path = sys.argv[1:]
icons = [
    line.strip()
    for line in open(manifest_path, encoding="utf-8")
    if line.strip() and not line.lstrip().startswith("#")
]

def icon_ligatures(font):
    cmap = font.getBestCmap()
    ligatures = {}
    for record in font["GSUB"].table.FeatureList.FeatureRecord:
        if record.FeatureTag != "rlig":
            continue
        for lookup_index in record.Feature.LookupListIndex:
            lookup = font["GSUB"].table.LookupList.Lookup[lookup_index]
            for extension in lookup.SubTable:
                subtable = getattr(extension, "ExtSubTable", extension)
                if not hasattr(subtable, "ligatures"):
                    continue
                for first_glyph, entries in subtable.ligatures.items():
                    for entry in entries:
                        ligatures[(first_glyph, *entry.Component)] = entry.LigGlyph
    return cmap, ligatures

source = TTFont(source_path)
subset = TTFont(subset_path)
cmap, ligatures = icon_ligatures(subset)
missing = []
for icon in icons:
    sequence = tuple(cmap.get(ord(char)) for char in icon)
    if None in sequence or sequence not in ligatures:
        missing.append(icon)

if missing:
    raise SystemExit("Subset is missing icon ligatures: " + ", ".join(missing))
if "fvar" not in subset or {axis.axisTag for axis in subset["fvar"].axes} != {
    axis.axisTag for axis in source["fvar"].axes
}:
    raise SystemExit("Subset did not preserve the source font's variable axes.")

print(f"Verified all {len(icons)} required ligatures and variable font axes.")
PY

chmod 644 "$SUBSET_FILE"
mv "$SUBSET_FILE" "$OUTPUT"
trap - EXIT
rm -f "$TEXT_FILE" "$GLYPH_FILE"
echo "Subset written to $OUTPUT ($(wc -c < "$OUTPUT" | tr -d ' ') bytes)"

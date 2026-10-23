#!/bin/sh
# Same public Scripting declaration snapshot used by battery-widget verification.
set -eu
cd "$(dirname "$0")"
mkdir -p .runtime-types
for file in global.d.ts scripting.d.ts; do
  curl --proto '=https' -fsSL "https://raw.githubusercontent.com/Yii-An/Scripting-Scripts/be3ea45b820b16c11fa7ce0b332b9b0e32ec5a3b/dts/$file" -o ".runtime-types/$file"
done
(cd .runtime-types && printf '%s\n' \
  'f8b82ae67ef6e6f53abad2b66559403c9296a97eedd728d7fb473ac11a32a4b1  global.d.ts' \
  '3fdcc4ef0ca032f569438645a79184ef7ee241e1812d517acfce8a4fd85e8905  scripting.d.ts' | sha256sum -c)
# The public snapshot may differ from the installed app. See VERIFICATION.md.

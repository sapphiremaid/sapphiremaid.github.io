GREYBLUE — PRIVATE PERSONAL BUILD

This is for Katherine's local use. It does not publish or deploy anything.

PACKAGED BUILD
  Double-click "Start Greyblue.vbs" from the extracted Greyblue bundle.
  The packaged build contains Greyblue, the dragon models, and vendored Three.js.

SOURCE SNAPSHOT FALLBACK
  If GitHub Actions is unavailable, download or check out the stabilization branch,
  open the greyblue-personal folder, and double-click "Start Greyblue.vbs" there.
  The launcher detects the repository layout and serves the sibling Greyblue source
  and dragon-model directories directly. The source snapshot keeps the accepted
  Three.js CDN import map, so this fallback needs internet access while playing.

WHAT THE LAUNCHER DOES
  - starts a local HTTP server bound only to 127.0.0.1
  - opens Greyblue in the default browser
  - never deploys or publishes the game
  - shuts the local server down automatically after eight hours

REQUIREMENT
  Node.js 22 or newer must be installed on the computer.

When the packaged Actions build is available, greyblue-build-manifest.json records
its source commit, stabilization base, Three.js version, model count, and the fact
that publicDeployment is false.

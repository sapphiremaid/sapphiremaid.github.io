GREYBLUE — PRIVATE PERSONAL BUILD

This is for Katherine's local use. It does not publish or deploy anything.

PACKAGED BUILD
  Double-click "Start Greyblue.vbs" from the extracted Greyblue bundle.
  The packaged build contains Greyblue, the dragon models, vendored Three.js,
  and its own Node.js runtime. It does not require a separate Node installation
  or internet access while playing.

SOURCE SNAPSHOT FALLBACK
  If a packaged build is unavailable, download or check out the stabilization branch,
  open the greyblue-personal folder, and double-click "Start Greyblue.vbs" there.
  The launcher detects the repository layout and serves the sibling Greyblue source
  and dragon-model directories directly. A source checkout without runtime\node.exe
  falls back to system Node.js and requires Node.js 22 or newer. The source snapshot
  keeps the accepted Three.js CDN import map, so that fallback needs internet access
  while playing.

WHAT THE LAUNCHER DOES
  - prefers the bundled private Node.js runtime when present
  - validates that the selected runtime is Node.js 22 or newer
  - starts a local HTTP server bound only to 127.0.0.1
  - opens Greyblue in the default browser
  - never deploys or publishes the game
  - shuts the local server down automatically after eight hours

PACKAGED RUNTIME
  The portable private bundle includes Node.js 22.23.2 under runtime\ together with
  its license. The runtime is used only to serve the extracted local game files.

When a packaged build is assembled, greyblue-build-manifest.json records its source
commit, stabilization base, Three.js version, model count, runtime version, loopback
binding, and the fact that publicDeployment is false.

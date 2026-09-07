# Git City 0.4.0 validation

Validated on macOS ARM64 with Node.js 26.8.1, Git 2.48.1, and OpenTUI 0.5.10.

## Automated checks

41 tests cover committed Git snapshots, historical metadata, additions and deletions, renames, merges, exclusions, binary files, unusual filenames, stable city geometry, asynchronous playback races, keyboard and mouse interaction, Unicode rendering, and terminal resizing. TypeScript compilation and npm packaging pass.

The native OpenTUI integration test compares the complete rendered character frame with the intended scene, including CJK text and emoji. A real terminal session was also launched, played, inspected, and closed successfully with terminal state restored.

## Version 0.4.0 checks

- Half-cell terrain draws continuous coastlines, rivers, forests, hills, and connected settlements. Native captures validate glyph placement across all eight exploration views.
- Land hit detection opens the correct repository folder; settlements stay on land and the road graph connects all occupied sites.
- Close views add paved streets, sidewalks, lamps, colored roofs, depth shading, and warm windows.
- Real repository names remain the labels; no geographic category labels are added.

- Stable folder territory boundaries across historical snapshots; nested folders and their direct files retain exact file membership.
- Native mouse navigation through regions and breadcrumbs; compact selection followed by expanded inspector tabs.
- Ranked current-commit search, including command letters typed into search without triggering global shortcuts.
- Source and first-parent commit diffs read exact Git objects, including root commits, literal unusual filenames, binary content, empty diffs, and 64 KiB truncation.
- Stale asynchronous source responses cannot replace a different selected file.
- Manual movement pauses playback; the minimap recenters the active coordinate space.
- Real React atlas, package territories, source streets, search results, selected-building preview, and source inspector captured through the native OpenTUI renderer.
- The 60-frame React history preview passed native character-frame matching on every frame.

## Existing repository and navigation checks

- Installed `gitcity` into the user-level Node bin directory and launched `gitcity expressjs/express --history` in a real terminal, including playback, wheel zoom, file inspection, and clean exit.
- Verified bare `owner/repo`, GitHub URL variants, and explicit local-path disambiguation.
- Verified an early close view with house roofs, stable coordinates, and automatic fitting as a 501-file city grows.
- Verified wheel zoom preserves the world point under the cursor.
- Verified all 2,500 files remain represented in overview cells, then drilled through a real native mouse click to an exact file and its metadata.
- Verified manual exploration disables automatic fitting and FIT restores it.
- Rechecked React's first and final trees with 280 and 7,135 files.

## Repository checks

| Repository                      | First-parent commits | Initial files | Latest files |
| ------------------------------- | -------------------: | ------------: | -----------: |
| Generated demonstration fixture |                  120 |             2 |           45 |
| expressjs/express               |                3,893 |             7 |          213 |
| facebook/react                  |               14,923 |           280 |        7,135 |

React was tested at `f1f7ed2ac267a21dd2e3e67c4a606b9cf56e360b`, dated September 4, 2026. Counts reflect the configured exclusions and first-parent history. They are not GitHub's total commit counts.

After cloning, React history analysis took about 2.3 seconds in one benchmark. An earlier history-engine benchmark traversed the timeline in 30.10 seconds at 1×. Playback remains driven by elapsed time, independently of how many intermediate frames are sampled. Network clone time is additional, and performance varies by machine and repository.

Exact file inspection was checked against Git blobs: React's `ReactHooks.js` had 241 lines, and Express's `lib/application.js` had 631 lines at the tested revisions.

## Preview and distribution

The [history preview](docs/images/history.gif) contains 60 native OpenTUI captures, each displayed for 250 ms: exactly 15 seconds. It samples real React history from May 2013 through September 2026 at 2×, using the application's automatic growing-city fit and camera easing. The GIF is a sampled playback preview, not a real-time screen recording.

The npm tarball is locally installable and was checked from a `node_modules` package location. The package has not been published to the npm registry. This repository includes the implementation, tests, demo generator, lockfile, and these instructions. Run `npm pack` to build a distributable tarball.

## Deliberate MVP limits

- Reads committed files from one first-parent ancestry chain; uncommitted changes are excluded.
- Rename history becomes a disappearing old building and an appearing new building.
- Language and generated-file detection use filename and directory heuristics.
- Historical line counts load on inspection; binary files display `binary`.
- Public GitHub loading uses complete temporary clones, removed on normal exit.
- Source and diffs are previews, limited to 64 KiB / 600 lines. Diff shows the selected commit, not the last commit that changed the file.
- Settlement positions are based on historical folder geometry. Unoccupied settlements are omitted; small labels reveal on hover or zoom. Terrain and roads are decorative, not real geography or a code-dependency graph.
- A minimap appears in manual exploration when no building selection or inspector occupies the foreground.
- The interactive runtime requires Node.js 26.4+ with FFI or an installed Bun runtime; the launcher selects it automatically.

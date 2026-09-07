# Next Git City release

The full requested scope is the eleven ideas accepted on September 6, 2026. Each completed feature is verified, committed, and pushed to `origin/main` separately. Existing functionality and public-repository loading remain supported.

- [x] Believable street layouts: connected approach roads, central squares, lanes, parks/courtyards, waterfront docks; buildings face their streets.
- [x] Architectural identity: distinguish documentation, build tooling, UI, and other files through silhouettes/materials; related folders share a style.
- [x] Continuous zoom: retain spatially aligned terrain and landmarks while revealing settlements, streets, and files; avoid unrelated coordinate resets.
- [x] Ambient life: road traffic, chimney smoke, boats, cloud shadows, and a day/night lighting cycle, with a pause/reduced-motion control.
- [x] Dependency traffic: resolve actual repository imports; select files to see their dependency routes and animated traffic.
- [x] Unique repository landscapes: stable repository identity seeds distinct terrain and architecture; history playback preserves geography.
- [x] Explorable ruins: deleted files persist as selectable foundations with last contents and deletion commit.
- [x] Guided tours: entrypoints, request/dependency journeys, and busiest files; camera movement, stop/advance controls, and explanations.
- [x] Activity overlays: churn, size, dependents, and contributor ownership derived from repository data, with a visible legend.
- [x] Version comparison: resolve two commits/branches and compare additions, removals, and changes with an interactive before/after slider.
- [x] Shareable views: export screenshots and short replay artifacts, and a reproducible command for the repository, commit, and location.

Completion requires native OpenTUI interaction and visual checks on small fixtures and React, relevant automated coverage, updated documentation, an updated local installation, and all feature commits present on GitHub. A checked box is not sufficient evidence on its own; validation results are recorded alongside completed features.

## Verification log

- Unique landscapes: `tests/world-style.test.ts` verifies canonical GitHub identity, distinct sampled terrain, stable positions across history, and cache identity. Native atlas/UI tests pass with the seeded renderer.
- Architecture: role classification and distinct drawing tests pass; shared folder materials are stable. Native React exploration captures match every scene cell, including the new roof glyphs.
- Street planning: `tests/urban.test.ts` checks every file entrance meets an avenue, plazas/gardens avoid file facades, lots do not overlap, and distance-based traffic paths traverse junctions correctly. Native React captures and 21 layout/UI checks pass.
- Ambient life: tests verify paused-history traffic/smoke movement, boat generation, frozen simulation time, day/night rendering, and moving cloud shade. Native React captures retain exact character alignment. `M` freezes ambient time; `N` cycles lighting; `GITCITY_REDUCED_MOTION=1` starts frozen.

- Ruins: deletion/recreation indexing and clickable foundations pass, including exact last-source/deletion-diff revisions and stale-selection guards. All 24 controller, atlas, ruins, and native UI tests pass. `U` toggles foundations.

- Dependency traffic: AST tests exclude comments/string decoys and verify relative imports, extension substitution, index modules, tsconfig aliases, workspace packages, unresolved imports, and incoming edges. Exact Git batch source reads and clickable file routes pass with repository/native UI checks. Coverage is JS/TS literal imports; limits and unresolved imports are visible.

- Activity overlays: historical/windowed churn, exact bytes, graph incoming counts, and dominant author calculations pass fixture tests. `O` cycles modes with a visible scale and selected-file values; ownership uses author names and commit touches rather than line attribution. Native rendering tests pass.

- Guided tours: entry/busy ranking and cycle-safe real-edge journeys pass; native picker clicks start a tour, bracket keys advance, Space pauses, Esc exits, and seeking invalidates the tour. Captions distinguish static imports from runtime traces.

- Comparison: real two-branch fixture verifies exact blobs, equal-size modifications, additions/deletions, last-source and two-revision diffs, slider endpoints, exit restoration, and `--at` branch history. `B` accepts A..B; left/right or clicking the slider reveals either revision. Missing public branch refs are fetched into the temporary clone.

- Continuous zoom: `WorldMap` keeps city lots, terrain, settlements, and the minimap in one affine space. `tests/world.test.ts` checks invertibility, terrain sampling, and that entering a folder or changing zoom does not move surviving buildings or settlement anchors. Pointer-stable `zoomAt` still holds. Landscape LOD is `zoom < 0.35`, not a coordinate reset.

- Shareable views: `Y` yanks a text screenshot plus `gitcity owner/repo --at HASH --focus path --view TOKEN` and writes `gitcity-share.txt`. `--view` is decoded in `parseArgs` before clone. `applyView` seeks `at:` inside loaded history. `--snapshot --view` prints the share artifact. `tests/view.test.ts` and `tests/cli.test.ts` cover restore, parse-time validation, and command round-trip.

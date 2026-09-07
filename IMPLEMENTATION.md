# Next Git City release

The full requested scope is the eleven ideas accepted on September 6, 2026. Each completed feature is verified, committed, and pushed to `origin/main` separately. Existing functionality and public-repository loading remain supported.

- [ ] Believable street layouts: connected approach roads, central squares, lanes, parks/courtyards, waterfront docks; buildings face their streets.
- [x] Architectural identity: distinguish documentation, build tooling, UI, and other files through silhouettes/materials; related folders share a style.
- [ ] Continuous zoom: retain spatially aligned terrain and landmarks while revealing settlements, streets, and files; avoid unrelated coordinate resets.
- [ ] Ambient life: road traffic, chimney smoke, boats, cloud shadows, and a day/night lighting cycle, with a pause/reduced-motion control.
- [ ] Dependency traffic: resolve actual repository imports; select files to see their dependency routes and animated traffic.
- [x] Unique repository landscapes: stable repository identity seeds distinct terrain and architecture; history playback preserves geography.
- [ ] Explorable ruins: deleted files persist as selectable foundations with last contents and deletion commit.
- [ ] Guided tours: entrypoints, request/dependency journeys, and busiest files; camera movement, stop/advance controls, and explanations.
- [ ] Activity overlays: churn, size, dependents, and contributor ownership derived from repository data, with a visible legend.
- [ ] Version comparison: resolve two commits/branches and compare additions, removals, and changes with an interactive before/after slider.
- [ ] Shareable views: export screenshots and short replay artifacts, and a reproducible command for the repository, commit, and location.

Completion requires native OpenTUI interaction and visual checks on small fixtures and React, relevant automated coverage, updated documentation, an updated local installation, and all feature commits present on GitHub. A checked box is not sufficient evidence on its own; validation results are recorded alongside completed features.

## Verification log

- Unique landscapes: `tests/world-style.test.ts` verifies canonical GitHub identity, distinct sampled terrain, stable positions across history, and cache identity. Native atlas/UI tests pass with the seeded renderer.
- Architecture: role classification and distinct drawing tests pass; shared folder materials are stable. Native React exploration captures match every scene cell, including the new roof glyphs.

# What people actually enjoy, and what this GitCity should steal

This note is sourced from live X lookups and the GitHub pages of similar tools on 2026-09-07. If a claim has no URL or post id, I did not check it. I wrote it while finishing continuous zoom and shareable views in this checkout, so the product advice is aimed at *this* terminal city, not at becoming thegitcity.com.

The short version. People share cities when they can find themselves in them, send a link, and read the encoding in one glance. They do not share a clever layout algorithm. Agents do not need a fly-through. They need structured neighborhoods, stable coordinates, and a command they can rerun.

## Two different products named Git City

Samuel Rizzon's [thegitcity.com](https://www.thegitcity.com/) ([srizzon/git-city](https://github.com/srizzon/git-city)) turns each *GitHub user* into a pixel-art building. Height is contributions, width is public repos, lit windows are stars and recent activity. GitHub itself posted it on 2026-04-26 ([post 2048494014383505661](https://x.com/github/status/2048494014383505661)).

This repository ([unluckyjet/GitCity](https://github.com/unluckyjet/GitCity)) turns a *git tree* into a terminal city. Files are houses and towers. Folders are settlements. First-parent history is time. `owner/repo` clones public GitHub without a token.

Those jobs collide in search results and nowhere else. Copying their PvP, shop cosmetics, or interiors would make this app worse at the job it already has.

## What blew up on X

The clip that actually moved is the social skyline, not the code-as-city metaphor.

Om Patel's video ([post 2026823955634393159](https://x.com/om_patel5/status/2026823955634393159), 26 Feb 2026) is the one people quote. "more commits = taller building. more repos = wider base. lit windows = recent activity." 6.8k likes, 467k views. Prasenjit recut the same idea ([post 2029123526628917428](https://x.com/prasenx/status/2029123526628917428)) with search-your-username and "this is what vibe coding actually looks like at its best." 1.5k likes, 133k views.

What those posts sell, in order:

1. You can find *your* building.
2. Height, width, and windows mean something without a legend.
3. You can fly, which is a toy people want to show a friend.

The product then doubled down on game loops. @thegitcity shipped walkable interiors and 48 hidden terminal secrets in the E.Arcade ([post 2034327607152398473](https://x.com/thegitcity/status/2034327607152398473), 18 Mar 2026). Later, Force Push, a daily PvP where you fly a CRT terminal and shoot other developers ([post 2057913571397582966](https://x.com/thegitcity/status/2057913571397582966), 22 May 2026). That is fun. It is also a different company.

Abhay's explainer ([post 2029558653372739997](https://x.com/abhxy03/status/2029558653372739997)) is the honest user pitch. Search a username, fly, compare, collect achievements named things like Full-Stack Mage. Pablo found his own building and asked other people to post theirs ([post 2029542455847076345](https://x.com/PabloHernandezB/status/2029542455847076345)). Sharing is the loop.

A quieter recent post is more useful to us. Manu of the Rock linked [gitropolis.vercel.app](https://gitropolis.vercel.app/) on 1 Sep 2026 ([post 2094668919965397452](https://x.com/mdelapenya/status/2094668919965397452)). "See you Git repositories as cities." Files as buildings, folders as districts, play the history. That is our job in a browser.

Charly Wargnier's GitDiagram clip from May 2025 still circulates ([post 1928367291890098337](https://x.com/DataChaz/status/1928367291890098337), [gitdiagram.com](https://gitdiagram.com)). People want a map of a repo they do not already know. Venkatesh said the same in Aug 2026 ([post 2089202456479899798](https://x.com/venkateshdotdev/status/2089202456479899798)). "Instead of staring at 100 folders: where do I even start?"

Hayden posted a Claude skill, codebase-atlas, that builds an isometric city of subsystems with measured LOC ([post 2088097953894277321](https://x.com/HaydenH36/status/2088097953894277321), live example at [mikeroysoft.github.io/codebase-atlas](https://mikeroysoft.github.io/codebase-atlas/)). Agents are already being asked to *draw* cities. They are not being asked to play them.

On the agent side, the thing people actually run is Gource. Bob the gptme agent rendered 76,414 commits of its own work headlessly ([post 2059669245785415908](https://x.com/TimeToBuildBob/status/2059669245785415908), writeup at [timetobuildbob.com](https://timetobuildbob.com/blog/visualizing-my-own-brain-76000-commits/)). ELG posted "Gource visualization demonstrates how a local agent modifies code" ([post 2074196082985255189](https://x.com/elg_oleksandr/status/2074196082985255189)). If this GitCity wants agent users, headless output is the product. The TUI is the demo.

## Similar GitHub projects

Richard Wettel's [CodeCity](https://wettel.github.io/codecity.html) is the academic original. Classes are buildings, packages are districts, metrics are visible properties. GoCity ([rodrigo-brito/gocity](https://github.com/rodrigo-brito/gocity), [go-city.github.io](https://go-city.github.io)) restates it for Go. Folders are districts, files are buildings, structs sit on top of their files. Height is methods, base is variables, color is LOC. JSCity ([aserg-ufmg/JSCity](https://github.com/aserg-ufmg/JSCity)) does the same for JavaScript functions. CoderCity ([INSO-TUWien/CoderCity](https://github.com/INSO-TUWien/CoderCity)) paints ownership hunks as building segments from `git blame`.

The closest *repository* city, not profile city, is [maximalcode/git-city](https://github.com/maximalcode/git-city). Buildings are files, taller means more lines, districts follow the tree, six colour encodings, history replays in about ten seconds. It is also a real git client (stage, commit, graph, rebase). It streams `git log --first-parent --reverse --no-renames --raw --numstat` and never checkouts. Caps drawing at 20,000 files because past that the streets stop being worth building. That cap is a lesson. A terminal city that tries to paint microsoft/TypeScript file-for-file will also go blind.

Other repo-as-city tools:

- [grahambrooks/codecity](https://github.com/grahambrooks/codecity). Multi-repo 3D city. Height is age, volume is LOC, color is language. Skyline for an org, then drill into directories.
- [Manavarya09/code-city](https://github.com/Manavarya09/code-city). Paste a GitHub URL, Three.js, no backend. Bugs become fires, deploys become rockets. Cute. Shallow git (GitHub API tree, not first-parent history).
- [gitropolis](https://gitropolis.vercel.app/). Public repo URL in, history as a 3D city, height damped logarithmically, districts coloured by top-level folder, construction flash by conventional-commit type. No install. That last point is why people try it.
- [honzaap/GitHubCity](https://github.com/honzaap/GitHubCity) (~1.3k stars). Contribution-graph city in Three.js. Same family as GitHub Skyline, not a file map.
- [github/gh-skyline](https://github.com/github/gh-skyline). Official CLI extension. STL of the contribution graph plus an ASCII preview in the terminal. The ASCII preview is the only official skyline that already lives where we live.
- [rishabhbhartiya/GitCity](https://github.com/rishabhbhartiya/GitCity). Contribution skyline with an embeddable SVG for READMEs. They even document that they are not thegitcity.com.
- [anshaneja5/skyline-run](https://github.com/anshaneja5/skyline-run). Fly a plane through a year of commits. Crash report names the date that killed you. Share URLs render as link previews.
- [acaudwell/Gource](https://github.com/acaudwell/Gource) ([gource.io](https://gource.io), 13k+ stars). Tree of the repo, files as leaves, authors walking around. Headless PPM stream for video. This is still the default "show me the history" command twenty years on because it has a CLI, not a landing page.

Gource is the competitor that should make us nervous. Not thegitcity.com.

## What this GitCity already has that they do not

A true-color terminal, OpenTUI, `owner/repo` with no token, first-parent history, ruins, import routes, churn overlays, and guided tours. maximalcode's desktop app is a better git client. srizzon's site is a better social toy. Nobody else is a city you can open in the same pane as `vim` and `git log`.

The unfinished work in IMPLEMENTATION.md is the right unfinished work. Continuous zoom is how Google Maps beat mode-switch maps. Shareable views are how skyline-run and GitDiagram spread. Headless `--json` / `--snapshot` are how Bob would actually use this instead of Gource.

## How to make the UI better without leaving the terminal

Help is a 21-line dump that already overflows a recommended 100×35 window (`src/scene.ts`, the `state.help` panel). Cut it to the keys for the current mode. Put the rest behind a second page. The footer already tries to be contextual. Make the `?` panel match it.

The inspector is dense and good. The minimap appears only with no selection. That is correct. Keep it. Once zoom is one coordinate system, the minimap should show the same world the camera is in, not a 280×58 atlas rectangle that jumps when you enter a folder.

The overlay legend (`O`) is the encoding people need. GitDiagram and maximalcode both spend a page on "what the colours mean." Ours is a strip. Spell the selected file's value in words, not only a number. "churn 14 / last 100 commits" reads. "14" does not.

Do not add a shop, a plane, or PvP. That is srizzon's loop. Ours is "I dropped into `facebook/react` and understood `packages/react-reconciler` in thirty seconds."

## Shareable views

skyline-run's share URL is the pattern. A pasteable command is the terminal version.

```
gitcity facebook/react --at 9f86d08 --view cx:12.4,cy:3.1,z:0.82,scope:packages/react-reconciler
```

`--view` and `--focus` already parse in `src/cli.ts` and never restore a camera. Finish that. Pair it with a text screenshot of the current OpenTUI frame (the scene already is a grid of cells) and a short replay (N frames of `--history` as text). Gource owns cinematic video. We should own a command you can paste into Discord.

Press `Y` to yank the command and write the artifact next to the repo, or print it in headless `--snapshot` when `--view` is set. Do not invent a hosted backend. The plan forbids one.

## Making this useful for agents

`--json` today is `{ name, commitIndex, totalCommits, commit, files }`. That is a file listing with extra steps. An agent already has `git ls-tree`. Give it the city.

A useful payload has:

- repo identity and the commit being shown
- neighborhoods with file counts, languages, bounding boxes
- each file's stable city coordinate, size, language, commit count, contributors
- the current camera if `--view` is set
- a `command` string that reproduces the view
- optional tour stops (entrypoints, busy files) so an agent can brief a human

`--snapshot` should keep the human table and add a one-line reproduce command. Tests must assert names and file paths from a real fixture, not exit code 0.

The codebase-atlas skill is the other agent-shaped demand. People want a *map they can hand a model*. Our `--json` can be that map without HTML. A later spin-off can be an MCP that shells out to `gitcity --json`. Do not build the MCP in this repo until the JSON is worth calling.

Bob's Gource post is the use case. An agent that just edited 200 files should dump `--json --history` and point a reviewer at the neighborhoods that grew. Coordinates that do not jump between zoom levels are what make that dump match the TUI.

## Spin-offs (keep them out of this tree)

- MCP wrapper around `--json` / `--snapshot`.
- README badge that renders `--snapshot` as SVG, the way rishabhbhartiya embeds a skyline.
- A "brief me" tour in JSON, entrypoints then import journey, for coding agents that just cloned a repo.
- PR blast-radius. We already have `--compare`. Emit the changed buildings as a JSON list an agent can open.
- Desktop 3D client. That is maximalcode's project. Do not start it here.
- Profile-as-building social city. That is srizzon. Do not start it here.

## What I would not do

I would not chase thegitcity.com's engagement. Their viral posts are about *you*. Ours is about *the repository*. Different animal.

I would not add a WebGL fallback. The whole point is the terminal.

I would not paint every file in a 80k-file repo. maximalcode measured 212 seconds versus 25 with a 20k cap. Overview cells already exist here. Keep them, and keep identities behind the click.

I would not treat ambient boats and day/night as the next feature. They shipped. Zoom and share did not.

## Sources

X posts (ids are the status numbers):

- 2026823955634393159 Om Patel, social Git City clip
- 2029123526628917428 Prasenjit, same idea plus search
- 2029542455847076345 Pablo Hernandez Borges, "found my building"
- 2029558653372739997 Abhay, thegitcity.com explainer
- 2034327607152398473 @thegitcity, E.Arcade interiors
- 2048494014383505661 @github, "Have you visited Git City yet?"
- 2057913571397582966 @thegitcity, Force Push PvP
- 2059669245785415908 @TimeToBuildBob, 76,414-commit Gource
- 2074196082985255189 @elg_oleksandr, Gource of a local agent
- 2088097953894277321 Hayden, codebase-atlas skill
- 2089202456479899798 Venkatesh, GitDiagram as "where do I start"
- 1928367291890098337 Charly Wargnier, GitDiagram
- 2094668919965397452 Manu of the Rock, gitropolis
- 2095233964449607883 Michael Roy, codebase-atlas on ROCm/rocm-cli
- 2096864797451002251 Enoch, "would you actually play this"

GitHub and sites:

- https://github.com/unluckyjet/GitCity
- https://github.com/srizzon/git-city
- https://www.thegitcity.com/
- https://github.com/maximalcode/git-city
- https://github.com/rodrigo-brito/gocity
- https://go-city.github.io
- https://wettel.github.io/codecity.html
- https://github.com/aserg-ufmg/JSCity
- https://github.com/INSO-TUWien/CoderCity
- https://github.com/grahambrooks/codecity
- https://github.com/Manavarya09/code-city
- https://github.com/honzaap/GitHubCity
- https://github.com/github/gh-skyline
- https://github.com/rishabhbhartiya/GitCity
- https://github.com/anshaneja5/skyline-run
- https://github.com/acaudwell/Gource
- https://gource.io
- https://gitropolis.vercel.app/
- https://gitdiagram.com
- https://mikeroysoft.github.io/codebase-atlas/
- https://timetobuildbob.com/blog/visualizing-my-own-brain-76000-commits/

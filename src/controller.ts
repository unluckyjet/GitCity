import { WorldMap } from "./world.ts";
import {
  decodeView,
  encodeView,
  formatReplay,
  formatScreenshot,
  formatShareArtifact,
  shareCommand,
  shareRepoId,
  type ViewLocation,
} from "./view.ts";
import type { Scene } from "./scene.ts";
import {
  createTour,
  type TourKind,
  type TourStop,
  activityMetrics,
  overlayModes,
  type Overlay,
  type Metric,
} from "./insights.ts";
import { analyzeDependencies, type DependencyGraph } from "./dependencies.ts";
import { RuinIndex, type Ruin } from "./ruins.ts";
import { styleFor, type WorldStyle } from "./world-style.ts";
import {
  AtlasIndex,
  inScope,
  parentPath,
  searchPaths,
  type Territory,
  type SearchResult,
} from "./atlas.ts";
import type { FileContent } from "./types.ts";
import { createCityLayout } from "./city.ts";
import type {
  Comparison,
  AppOptions,
  Building,
  City,
  CityLayout,
  RepoFile,
  Repository,
} from "./types.ts";

/** Owns asynchronous history requests, so a slow frame can never replace a newer seek. */
export class CityController {
  readonly repository: Repository;
  readonly worldStyle: WorldStyle;
  readonly layout: CityLayout;
  readonly world: WorldMap;
  private rootTerritories: Territory[] = [];
  get geography() {
    return this.world.geography(this.territories);
  }
  get worldGeography() {
    return this.world.geography(this.rootTerritories);
  }
  city: City = { districts: [], buildings: [], width: 0, height: 0 };
  index = 0;
  requestedIndex = 0;
  selected: string | undefined;
  detail: RepoFile | undefined;
  playing = false;
  speed: number;
  timelineMode = false;
  panel = false;
  help = false;
  share: string | undefined;
  loading = false;
  error = "";
  camera = { x: 0, y: 0 };
  cameraTarget = { x: 0, y: 0 };
  zoom = 1;
  zoomTarget = 1;
  autoCamera = true;
  viewport = { width: 100, height: 26 };
  onChange: () => void = () => {};
  readonly atlas: AtlasIndex;
  readonly ruinIndex: RuinIndex;
  ruins: Ruin[] = [];
  ruinsVisible = true;
  private ruinView:
    | { key: string; source: Ruin[]; buildings: Building[] }
    | undefined;
  scope = "";
  direct = false;
  atlasMode = false;
  territories: Territory[] = [];
  searchOpen = false;
  query = "";
  results: SearchResult[] = [];
  resultIndex = 0;
  inspectorTab: "details" | "source" | "diff" = "details";
  content: FileContent | undefined;
  contentLoading = false;
  contentScroll = 0;
  onOpenUrl: (url: string) => void = () => {};
  comparison: Comparison | undefined;
  compareInput = false;
  compareText = "HEAD~1..HEAD";
  compareFraction = 0.5;
  private compareRequest = 0;
  async startComparison(spec = this.compareText) {
    const parts = spec.split("..");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      this.error =
        "Use before..after, for example main..feature or HEAD~1..HEAD.";
      this.onChange();
      return;
    }
    this.stopPlayback();
    this.stopTour();
    this.compareInput = false;
    this.loading = true;
    const id = ++this.compareRequest;
    this.onChange();
    try {
      if (!this.repository.compare)
        throw new Error("Version comparison unavailable.");
      const comparison = await this.repository.compare(parts[0], parts[1]);
      if (id !== this.compareRequest || this.closed) return;
      this.comparison = comparison;
      this.compareText = spec;
      const union = new Map(
        [...comparison.before.files, ...comparison.after.files].map((f) => [
          f.path,
          f,
        ]),
      );
      this.city = this.layout.build([...union.values()]);
      this.refreshTerritories();
      this.selected = undefined;
      this.panel = false;
      this.ruins = [];
      this.overlay = "off";
      this.dependencyMode = false;
      this.autoCamera = true;
      this.fitScope();
      this.settleCamera();
      this.error = "";
    } catch (error) {
      if (id === this.compareRequest) this.error = String(error);
    } finally {
      if (id === this.compareRequest) {
        this.loading = false;
        this.onChange();
      }
    }
  }
  async clearComparison() {
    this.compareRequest++;
    this.comparison = undefined;
    await this.seek(this.index);
  }
  setCompareFraction(value: number) {
    this.compareFraction = Math.max(0, Math.min(1, value));
    this.onChange();
  }
  tourMenu = false;
  tour:
    | {
        kind: TourKind;
        stops: TourStop[];
        index: number;
        playing: boolean;
        nextAt: number;
      }
    | undefined;
  private tourRequest = 0;
  async startTour(kind: TourKind) {
    const id = ++this.tourRequest,
      index = this.index,
      selected = this.selected;
    this.stopPlayback();
    this.tourMenu = false;
    const graph = kind === "busy" ? this.graph : await this.ensureGraph();
    if (id !== this.tourRequest || this.closed || index !== this.index) return;
    const stops = createTour(kind, this.city.buildings, graph, selected);
    if (!stops.length) {
      this.error =
        "No matching tour stops at this commit. Try busiest files or select a file with imports.";
      this.onChange();
      return;
    }
    this.tour = {
      kind,
      stops,
      index: 0,
      playing: true,
      nextAt: this.clock + 8000,
    };
    this.tourStep(0);
  }
  tourStep(delta: number) {
    if (!this.tour) return;
    this.tour.index = Math.max(
      0,
      Math.min(this.tour.stops.length - 1, this.tour.index + delta),
    );
    this.tour.nextAt = this.clock + 8000;
    const camera = { ...this.camera },
      zoom = this.zoom;
    this.visitFile(this.tour.stops[this.tour.index]!.path);
    this.camera = camera;
    this.zoom = zoom;
    this.panel = false;
    this.onChange();
  }
  stopTour() {
    this.tour = undefined;
    this.tourMenu = false;
    this.tourRequest++;
    this.onChange();
  }
  overlay: Overlay = "off";
  private metricCache:
    | {
        mode: Overlay;
        city: City;
        graph: DependencyGraph | undefined;
        values: Map<string, Metric>;
      }
    | undefined;
  get metrics() {
    if (
      this.metricCache?.mode === this.overlay &&
      this.metricCache.city === this.city &&
      this.metricCache.graph === this.graph
    )
      return this.metricCache.values;
    const values = activityMetrics(
      this.overlay,
      this.city.buildings,
      this.repository.commits,
      this.index,
      this.graph,
    );
    this.metricCache = {
      mode: this.overlay,
      city: this.city,
      graph: this.graph,
      values,
    };
    return values;
  }
  cycleOverlay() {
    this.overlay =
      overlayModes[
        (overlayModes.indexOf(this.overlay) + 1) % overlayModes.length
      ]!;
    if (this.overlay === "dependents") void this.ensureGraph();
    this.onChange();
  }
  dependencyMode = false;
  graph: DependencyGraph | undefined;
  graphLoading = false;
  private graphRequests = new Map<number, Promise<DependencyGraph>>();
  async ensureGraph() {
    const index = this.index;
    let request = this.graphRequests.get(index);
    if (!request) {
      request = (async () => {
        if (!this.repository.sources)
          throw new Error(
            "Dependency analysis is unavailable for this repository.",
          );
        return analyzeDependencies(
          await this.repository.sources(index),
          (await this.repository.snapshot(index)).map((f) => f.path),
        );
      })();
      this.graphRequests.set(index, request);
      if (this.graphRequests.size > 3)
        this.graphRequests.delete(this.graphRequests.keys().next().value!);
      request.catch(() => this.graphRequests.delete(index));
    }
    this.graphLoading = true;
    this.onChange();
    try {
      const graph = await request;
      if (!this.closed && index === this.index) this.graph = graph;
      return graph;
    } catch (error) {
      if (!this.closed && index === this.index) this.error = String(error);
      return undefined;
    } finally {
      if (index === this.index) {
        this.graphLoading = false;
        this.onChange();
      }
    }
  }
  toggleDependencies() {
    this.dependencyMode = !this.dependencyMode;
    if (this.dependencyMode || this.overlay === "dependents")
      void this.ensureGraph();
    this.onChange();
  }
  get connections() {
    return this.selected && this.graph
      ? [
          ...(this.graph.outgoing.get(this.selected) ?? []).map((path) => ({
            path,
            direction: "imports",
          })),
          ...(this.graph.incoming.get(this.selected) ?? []).map((path) => ({
            path,
            direction: "used by",
          })),
        ]
      : [];
  }
  visitFile(path: string) {
    this.enter(parentPath(path), true, true);
    const b = this.visibleBuildings.find((b) => b.path === path);
    if (b) this.select(b, true);
  }
  activity = "";
  hovered = "";
  clock = 0;
  ambient = process.env.GITCITY_REDUCED_MOTION !== "1";
  ambientTime = 0;
  lighting: "auto" | "day" | "night" = "auto";
  private ambientTick: number | undefined;
  transitions = new Map<
    string,
    { building: Building; kind: "add" | "edit" | "delete"; start: number }
  >();
  private scopedView: { key: string; source: City; city: City } | undefined;
  private contentId = 0;
  private navigation: {
    scope: string;
    direct: boolean;
    atlasMode: boolean;
    camera: { x: number; y: number };
    zoom: number;
  }[] = [];
  private requestId = 0;
  private detailId = 0;
  private closed = false;
  private lastTick = 0;
  private playbackIntent = false;
  private playbackCursor = 0;
  private previousTick = 0;
  private introView = false;

  private initialOptions: AppOptions;
  constructor(repository: Repository, options: AppOptions) {
    this.initialOptions = options;
    this.repository = repository;
    this.worldStyle = styleFor(repository.githubUrl ?? repository.name);
    this.atlas = new AtlasIndex(repository.allPaths);
    this.ruinIndex = new RuinIndex(repository.commits);
    this.layout = createCityLayout(
      repository.allPaths,
      repository.commits.flatMap((commit) =>
        commit.changes
          .filter((change) => change.status !== "deleted")
          .map((change) => change.path),
      ),
    );
    this.world = new WorldMap(
      this.layout,
      repository.allPaths,
      this.worldStyle.key,
    );
    this.speed = options.speed;
    this.timelineMode = options.history;
    this.index = options.history
      ? 0
      : Math.max(0, repository.commits.length - 1);
    this.requestedIndex = this.index;
  }

  async init() {
    await this.seek(this.index);
    if (this.timelineMode && this.index === 0) this.frameBeginning();
    else this.resetCamera(true);
    if (this.initialOptions.compare)
      await this.startComparison(this.initialOptions.compare);
    if (this.initialOptions.view)
      await this.applyView(this.initialOptions.view);
    if (
      this.initialOptions.focus &&
      !this.initialOptions.view &&
      !this.selected
    )
      this.visitFile(this.initialOptions.focus);
  }

  captureView(): ViewLocation {
    return {
      zoom: this.zoom,
      x: this.camera.x,
      y: this.camera.y,
      scope: this.scope,
      direct: this.direct,
      selected: this.selected,
      at: this.commit?.hash,
    };
  }

  async applyView(token: string) {
    const view = decodeView(token);
    this.stopPlayback();
    this.autoCamera = false;
    if (view.at) {
      const index = this.repository.commits.findIndex(
        (commit) =>
          commit.hash === view.at || commit.hash.startsWith(view.at!),
      );
      if (index >= 0) await this.seek(index);
    }
    this.scope = view.scope;
    this.direct = view.direct;
    this.refreshTerritories();
    if (view.selected) {
      const building =
        this.visibleBuildings.find((b) => b.path === view.selected) ??
        this.city.buildings.find((b) => b.path === view.selected);
      if (building) this.select(building, false);
      else this.selected = view.selected;
    }
    this.zoom = this.zoomTarget = Math.max(0.001, Math.min(4, view.zoom));
    this.camera = this.cameraTarget = { x: view.x, y: view.y };
    this.syncLod();
  }

  yankShare(scene: Scene) {
    const view = this.captureView();
    const command = shareCommand(shareRepoId(this.repository), view);
    const shot = formatScreenshot(scene);
    const replay = formatReplay([
      { title: view.at?.slice(0, 8) || "view", body: shot },
    ]);
    this.share = formatShareArtifact(command, shot, replay);
    this.help = false;
    return this.share;
  }

  viewToken() {
    return encodeView(this.captureView());
  }

  get commit() {
    return this.repository.commits[this.index];
  }
  get selectedBuilding() {
    return (
      this.visibleBuildings.find((b) => b.path === this.selected) ??
      this.city.buildings.find((b) => b.path === this.selected) ??
      this.visibleRuinBuildings.find((b) => b.path === this.selected)
    );
  }

  async seek(index: number): Promise<void> {
    if (this.closed || !this.repository.commits.length) return;
    const target = Math.max(
      0,
      Math.min(this.repository.commits.length - 1, Math.round(index)),
    );
    this.stopTour();
    this.compareRequest++;
    this.comparison = undefined;
    this.requestedIndex = target;
    const requestId = ++this.requestId;
    this.loading = true;
    this.error = "";
    this.onChange();
    try {
      const files = await this.repository.snapshot(target);
      if (requestId !== this.requestId || this.closed) return;
      const previous = new Map(this.city.buildings.map((b) => [b.path, b]));
      const previousIndex = this.index;
      this.index = target;
      this.introView = false;
      this.city = this.layout.build(files);
      this.transitions.clear();
      if (previous.size && previousIndex !== target) {
        const touched = new Set(
          this.repository.commits
            .slice(
              Math.min(previousIndex, target) + 1,
              Math.max(previousIndex, target) + 1,
            )
            .flatMap((c) => c.changes.map((c) => c.path)),
        );
        let added = 0,
          edited = 0;
        for (const b of this.city.buildings) {
          const old = previous.get(b.path);
          if (!old || touched.has(b.path)) {
            this.transitions.set(b.path, {
              building: b,
              kind: old ? "edit" : "add",
              start: this.clock,
            });
            old ? edited++ : added++;
          }
          previous.delete(b.path);
        }
        for (const b of previous.values())
          this.transitions.set(b.path, {
            building: b,
            kind: "delete",
            start: this.clock,
          });
        this.activity = `+${added} built   ~${edited} edited   −${previous.size} removed`;
      }
      this.ruins = this.ruinIndex.at(target, new Set(files.map((f) => f.path)));
      this.refreshTerritories();
      this.graph = undefined;
      if (this.dependencyMode || this.overlay === "dependents")
        void this.ensureGraph();
      this.content = undefined;
      this.contentId++;
      this.detail = undefined;
      if (this.selected && !files.some((file) => file.path === this.selected))
        this.selected = undefined;
      if (this.autoCamera) this.fitScope();
      if (target === this.repository.commits.length - 1) this.playing = false;
      if (this.panel && this.selected) {
        void this.inspect();
        if (this.inspectorTab !== "details")
          void this.loadContent(this.inspectorTab);
      }
    } catch (error) {
      if (requestId !== this.requestId || this.closed) return;
      this.error = error instanceof Error ? error.message : String(error);
      this.playing = false;
    } finally {
      if (requestId === this.requestId && !this.closed) {
        this.loading = false;
        this.onChange();
      }
    }
  }

  async togglePlayback() {
    this.timelineMode = true;
    if (this.playing || this.playbackIntent) {
      this.stopPlayback();
      this.onChange();
      return;
    }
    this.playbackIntent = true;
    if (this.index === this.repository.commits.length - 1) {
      this.scope = "";
      this.direct = false;
      this.atlasMode = false;
      this.navigation = [];
      this.autoCamera = true;
      this.panel = false;
      this.selected = undefined;
      const expectedRequest = this.requestId + 1;
      await this.seek(0);
      if (expectedRequest !== this.requestId) {
        this.playbackIntent = false;
        return;
      }
      this.frameBeginning();
    }
    if (
      !this.playbackIntent ||
      this.closed ||
      this.error ||
      this.repository.commits.length < 2
    ) {
      this.playbackIntent = false;
      return;
    }
    this.playing = true;
    this.playbackIntent = false;
    this.lastTick = 0;
    this.previousTick = 0;
    this.playbackCursor = this.index;
    this.onChange();
  }

  tick(now: number) {
    if (this.closed) return;
    if (this.ambient && this.ambientTick !== undefined)
      this.ambientTime += Math.max(0, Math.min(250, now - this.ambientTick));
    this.ambientTick = now;
    const hadTransitions = this.transitions.size > 0;
    this.clock = now;
    if (this.tour?.playing && now >= this.tour.nextAt) {
      if (this.tour.index < this.tour.stops.length - 1) this.tourStep(1);
      else {
        this.tour.playing = false;
        this.onChange();
      }
    }
    for (const [path, change] of this.transitions)
      if (now - change.start > 1200) this.transitions.delete(path);
    const centerX = this.camera.x + this.viewport.width / (2 * this.zoom);
    const centerY = this.camera.y + this.viewport.height / (2 * this.zoom);
    const targetX =
      this.cameraTarget.x + this.viewport.width / (2 * this.zoomTarget);
    const targetY =
      this.cameraTarget.y + this.viewport.height / (2 * this.zoomTarget);
    const easing = this.autoCamera ? 0.14 : 0.35;
    this.zoom += (this.zoomTarget - this.zoom) * easing;
    this.syncLod();
    this.camera = {
      x:
        centerX +
        (targetX - centerX) * easing -
        this.viewport.width / (2 * this.zoom),
      y:
        centerY +
        (targetY - centerY) * easing -
        this.viewport.height / (2 * this.zoom),
    };
    if (!this.playing) {
      if (
        Math.abs(this.zoom - this.zoomTarget) > 0.0001 ||
        Math.abs(this.camera.x - this.cameraTarget.x) > 0.001 ||
        Math.abs(this.camera.y - this.cameraTarget.y) > 0.001 ||
        hadTransitions ||
        this.ambient
      )
        this.onChange();
      return;
    }
    const elapsed = this.previousTick
      ? Math.max(0, now - this.previousTick)
      : 125;
    this.previousTick = now;
    this.playbackCursor +=
      (elapsed / 1000) *
      Math.max(8, (this.repository.commits.length - 1) / 30) *
      this.speed;
    if (
      this.loading ||
      now - this.lastTick < 125 ||
      this.playbackCursor < this.index + 1
    )
      return;
    this.lastTick = now;
    // Elapsed time drives playback even when reading a historical tree is slow.
    // Intermediate frames may be skipped; manual stepping always stays exact.
    void this.seek(Math.floor(this.playbackCursor));
  }

  toggleAmbient() {
    this.ambient = !this.ambient;
    this.onChange();
  }
  cycleLighting() {
    this.lighting =
      this.lighting === "auto"
        ? "day"
        : this.lighting === "day"
          ? "night"
          : "auto";
    this.onChange();
  }
  stopPlayback() {
    this.playing = false;
    this.playbackIntent = false;
  }
  step(delta: number) {
    this.stopPlayback();
    this.timelineMode = true;
    return this.seek(this.requestedIndex + delta);
  }
  setSpeed(direction: number) {
    this.speed = Math.max(
      0.25,
      Math.min(32, this.speed * (direction > 0 ? 2 : 0.5)),
    );
    this.onChange();
  }

  move(dx: number, dy: number) {
    this.stopPlayback();
    this.autoCamera = false;
    this.cameraTarget.x += dx / this.zoomTarget;
    this.cameraTarget.y += dy / this.zoomTarget;
    this.onChange();
  }

  /** Screen offsets are relative to the city viewport, not the terminal header. */
  zoomAt(
    factor: number,
    x = this.viewport.width / 2,
    y = this.viewport.height / 2,
  ) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.stopPlayback();
    this.autoCamera = false;
    const worldX = this.camera.x + x / this.zoom;
    const worldY = this.camera.y + y / this.zoom;
    this.zoom = this.zoomTarget = Math.max(
      0.001,
      Math.min(4, this.zoom * factor),
    );
    this.camera = this.cameraTarget = {
      x: worldX - x / this.zoom,
      y: worldY - y / this.zoom,
    };
    this.syncLod();
    this.onChange();
  }

  resetCamera(immediate = false) {
    this.introView = false;
    this.autoCamera = true;
    this.fitScope();
    if (immediate) this.settleCamera();
    this.onChange();
  }

  private frameBeginning() {
    this.atlasMode = false;
    this.introView = true;
    this.autoCamera = true;
    const firstStreet = this.city.districts[0]?.buildings.slice(0, 4) ?? [];
    this.fitBuildings(firstStreet, 1.4);
    this.settleCamera();
    this.onChange();
  }

  resizeViewport(width: number, height: number) {
    this.viewport = { width, height };
    if (!this.autoCamera) return;
    if (this.introView) this.frameBeginning();
    else this.resetCamera();
  }

  settleCamera() {
    this.camera = { ...this.cameraTarget };
    this.zoom = this.zoomTarget;
    this.syncLod();
  }

  private fitBuildings(
    buildings: Building[],
    maxZoom: number,
    inspector = false,
  ) {
    if (!buildings.length) {
      this.cameraTarget = { x: -5, y: 0 };
      this.zoomTarget = 1;
      return;
    }
    let left = Infinity,
      right = -Infinity,
      top = Infinity,
      bottom = -Infinity;
    for (const building of buildings) {
      left = Math.min(left, building.x - 2);
      right = Math.max(right, building.x + building.width + 3);
      top = Math.min(top, building.y - building.height - 4);
      bottom = Math.max(bottom, building.y + 4);
    }
    const availableWidth = Math.max(
      16,
      this.viewport.width -
        (inspector ? Math.min(39, this.viewport.width / 2) : 0),
    );
    const availableHeight = Math.max(1, this.viewport.height - 2);
    this.zoomTarget = Math.max(
      0.001,
      Math.min(
        maxZoom,
        (availableWidth - 4) / (right - left),
        availableHeight / (bottom - top),
      ),
    );
    this.cameraTarget = {
      x: (left + right) / 2 - availableWidth / (2 * this.zoomTarget),
      y: (top + bottom) / 2 - this.viewport.height / (2 * this.zoomTarget),
    };
  }

  /** Dense overview cells retain every file identity and can be drilled into. */
  zoomToGroup(buildings: Building[]) {
    if (!buildings.length) return;
    this.stopPlayback();
    this.autoCamera = false;
    this.panel = false;
    this.selected = undefined;
    this.detail = undefined;
    this.fitBuildings(buildings, 3);
    this.settleCamera();
    this.onChange();
  }

  select(building: Building, center = false) {
    this.stopPlayback();
    this.autoCamera = false;
    this.atlasMode = false;
    this.selected = building.path;
    this.content = undefined;
    this.contentId++;
    this.contentScroll = 0;
    this.contentLoading = false;
    this.detail = undefined;
    if (center) {
      this.fitBuildings([building], 2, true);
      this.settleCamera();
    }
    if (this.panel) {
      void this.inspect();
      if (this.inspectorTab !== "details")
        void this.loadContent(this.inspectorTab);
    }
    this.onChange();
  }

  cycle(direction: number) {
    const buildings = this.visibleBuildings;
    if (!buildings.length) return;
    const i = buildings.findIndex((b) => b.path === this.selected);
    const next =
      i < 0
        ? direction < 0
          ? buildings.length - 1
          : 0
        : (i + direction + buildings.length) % buildings.length;
    this.select(buildings[next], true);
  }

  async inspect() {
    if (!this.selected) {
      const cx = this.camera.x + this.viewport.width / (2 * this.zoom),
        cy = this.camera.y + this.viewport.height / (2 * this.zoom);
      const nearest = [...this.visibleBuildings].sort(
        (a, b) =>
          Math.hypot(a.x - cx, (a.y - cy) * 2) -
          Math.hypot(b.x - cx, (b.y - cy) * 2),
      )[0];
      if (nearest) this.selected = nearest.path;
    }
    this.stopPlayback();
    this.panel = true;
    if (this.selected) this.autoCamera = false;
    this.onChange();
    if (!this.selected) return;
    const path = this.selected,
      index = this.index,
      detailId = ++this.detailId;
    try {
      const detail = this.comparison
        ? (this.comparison.after.files.find((f) => f.path === path) ??
          this.comparison.before.files.find((f) => f.path === path))
        : await this.repository.inspect(
            this.selectedRuin?.lastIndex ?? index,
            path,
          );
      if (
        !this.closed &&
        detailId === this.detailId &&
        path === this.selected &&
        index === this.index
      )
        this.detail = detail;
    } catch (error) {
      if (
        !this.closed &&
        detailId === this.detailId &&
        path === this.selected &&
        index === this.index
      )
        this.error = String(error);
    }
    this.onChange();
  }

  get selectedRuin() {
    return this.ruins.find((r) => r.path === this.selected);
  }
  get visibleRuinBuildings(): Building[] {
    if (!this.ruinsVisible) return [];
    const key = JSON.stringify([this.scope, this.direct]);
    if (this.ruinView?.key === key && this.ruinView.source === this.ruins)
      return this.ruinView.buildings;
    const buildings = this.layout.build(
      this.ruins
        .filter((r) => inScope(r.path, this.scope, this.direct))
        .map((r) => r.file),
    ).buildings;
    this.ruinView = { key, source: this.ruins, buildings };
    return buildings;
  }
  toggleRuins() {
    this.ruinsVisible = !this.ruinsVisible;
    if (!this.ruinsVisible && this.selectedRuin) {
      this.selected = undefined;
      this.panel = false;
    }
    this.onChange();
  }
  get visibleCity(): City {
    if (!this.scope && !this.direct) return this.city;
    const key = JSON.stringify([this.scope, this.direct]);
    if (this.scopedView?.key === key && this.scopedView.source === this.city)
      return this.scopedView.city;
    const buildings = this.city.buildings.filter((b) =>
      inScope(b.path, this.scope, this.direct),
    );
    const paths = new Set(buildings.map((b) => b.path));
    const city = {
      ...this.city,
      buildings,
      districts: this.city.districts
        .map((d) => ({
          ...d,
          buildings: d.buildings.filter((b) => paths.has(b.path)),
        }))
        .filter((d) => d.buildings.length),
    };
    this.scopedView = { key, source: this.city, city };
    return city;
  }
  get visibleBuildings() {
    return this.visibleCity.buildings;
  }
  projectBuilding(building: Building) {
    return building;
  }
  private refreshTerritories() {
    this.territories = this.atlas.territories(this.scope, this.city.buildings);
    this.rootTerritories = this.scope
      ? this.atlas.territories("", this.city.buildings)
      : this.territories;
  }
  private syncLod() {
    this.atlasMode =
      this.zoom < 0.35 && !this.direct && this.atlas.hasChildren(this.scope);
  }
  private fitScope() {
    this.fitBuildings(
      this.visibleBuildings.length
        ? this.visibleBuildings
        : this.visibleRuinBuildings,
      1.4,
    );
    this.syncLod();
  }

  enter(scope: string, direct = false, fileView = false) {
    this.stopPlayback();
    this.autoCamera = false;
    this.navigation.push({
      scope: this.scope,
      direct: this.direct,
      atlasMode: this.atlasMode,
      camera: { ...this.camera },
      zoom: this.zoom,
    });
    this.scope = scope;
    this.direct = direct;
    this.atlasMode = !fileView && !direct && this.atlas.hasChildren(scope);
    this.selected = undefined;
    this.detail = undefined;
    this.panel = false;
    this.refreshTerritories();
    this.fitScope();
    if (!this.atlasMode && this.zoomTarget < 0.35) {
      const street =
        this.visibleCity.districts.find((d) => d.buildings.length)?.buildings ??
        [];
      this.fitBuildings(street, 1.4);
    }
    this.onChange();
  }
  back() {
    this.stopPlayback();
    this.autoCamera = false;
    const prior = this.navigation.pop();
    if (prior) {
      Object.assign(this, prior);
      this.cameraTarget = { ...prior.camera };
      this.zoomTarget = prior.zoom;
    } else if (this.scope || this.direct) {
      this.scope = parentPath(this.scope);
      this.direct = false;
      this.atlasMode = this.atlas.hasChildren(this.scope);
      this.refreshTerritories();
      this.fitScope();
      this.settleCamera();
    } else {
      this.atlasMode = this.atlas.hasChildren("");
      this.fitScope();
      this.settleCamera();
    }
    this.selected = undefined;
    this.panel = false;
    this.refreshTerritories();
    this.onChange();
  }
  openSearch() {
    this.stopPlayback();
    this.searchOpen = true;
    this.updateSearch("");
  }
  updateSearch(query: string) {
    this.query = query.slice(0, 240);
    this.results = searchPaths(this.city.buildings, this.query);
    this.resultIndex = 0;
    this.onChange();
  }
  activateResult(index = this.resultIndex) {
    const result = this.results[index];
    if (!result) return;
    this.searchOpen = false;
    if (result.kind === "folder") this.enter(result.path);
    else {
      this.enter(parentPath(result.path), true, true);
      const b =
        this.selectedBuilding ??
        this.visibleBuildings.find((b) => b.path === result.path);
      if (b) this.select(b, true);
    }
    this.onChange();
  }
  async loadContent(tab: "source" | "diff") {
    if (!this.selected) return;
    this.stopPlayback();
    this.panel = true;
    this.inspectorTab = tab;
    this.content = undefined;
    this.contentScroll = 0;
    this.contentLoading = true;
    const path = this.selected,
      index = this.index,
      id = ++this.contentId;
    this.onChange();
    try {
      const method =
        tab === "source" ? this.repository.preview : this.repository.diff;
      const ruin = this.selectedRuin;
      const contentIndex = ruin
        ? tab === "source"
          ? ruin.lastIndex
          : ruin.deletionIndex
        : index;
      const revision =
        this.comparison?.[
          this.comparison.after.blobs.has(path) ? "after" : "before"
        ];
      const result =
        this.comparison && tab === "diff" && this.repository.diffRevisions
          ? await this.repository.diffRevisions(
              this.comparison.before.hash,
              this.comparison.after.hash,
              path,
            )
          : revision && this.repository.previewRevision
            ? await this.repository.previewRevision(revision.hash, path)
            : method
              ? await method(contentIndex, path)
              : {
                  text: "Preview unavailable for this repository.",
                  binary: false,
                  truncated: false,
                };
      if (
        !this.closed &&
        id === this.contentId &&
        path === this.selected &&
        index === this.index
      )
        this.content = result;
    } catch (error) {
      if (
        !this.closed &&
        id === this.contentId &&
        path === this.selected &&
        index === this.index
      )
        this.content = { text: String(error), binary: false, truncated: false };
    } finally {
      if (id === this.contentId) {
        this.contentLoading = false;
        this.onChange();
      }
    }
  }
  openGitHub() {
    const base = this.repository.githubUrl;
    if (!base || !this.selected || !this.commit) {
      this.error = "No GitHub remote is available for this file.";
      this.onChange();
      return;
    }
    const revision =
      this.comparison?.[
        this.comparison.after.blobs.has(this.selected) ? "after" : "before"
      ].hash;
    this.onOpenUrl(
      `${base}/blob/${revision ?? this.repository.commits[this.selectedRuin?.lastIndex ?? this.index]!.hash}/${this.selected.split("/").map(encodeURIComponent).join("/")}`,
    );
  }
  recenter(x: number, y: number) {
    this.stopPlayback();
    this.autoCamera = false;
    this.cameraTarget = {
      x: x - this.viewport.width / (2 * this.zoomTarget),
      y: y - this.viewport.height / (2 * this.zoomTarget),
    };
    this.onChange();
  }
  close() {
    this.closed = true;
    this.stopPlayback();
    this.requestId++;
    this.detailId++;
    this.contentId++;
    this.onChange = () => {};
  }
}

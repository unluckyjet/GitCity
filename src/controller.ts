import {
  activityMetrics,
  overlayModes,
  type Overlay,
  type Metric,
} from "./insights.ts";
import { analyzeDependencies, type DependencyGraph } from "./dependencies.ts";
import { RuinIndex, type Ruin } from "./ruins.ts";
import { styleFor, type WorldStyle } from "./world-style.ts";
import { geographyFor } from "./geography.ts";
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
  private scopedLayouts = new Map<string, CityLayout>();
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

  constructor(repository: Repository, options: AppOptions) {
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
    if (
      this.atlasMode &&
      factor > 1 &&
      this.zoom > this.atlasFitZoom() * 1.65
    ) {
      const wx = this.camera.x + x / this.zoom,
        wy = this.camera.y + y / this.zoom;
      const region = geographyFor(this.territories, this.worldStyle.key).pick(
        wx,
        wy,
      )?.region;
      if (region) {
        this.enter(region.path, region.direct);
        return;
      }
    }
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
    if (
      factor < 1 &&
      this.atlasMode &&
      this.zoom < this.atlasFitZoom() * 0.65 &&
      (this.scope || this.direct)
    ) {
      this.back();
      return;
    }
    if (
      factor < 1 &&
      !this.atlasMode &&
      this.zoom < 0.25 &&
      this.atlas.hasChildren(this.scope) &&
      !this.direct
    ) {
      this.enter(this.scope);
      return;
    }
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
      const detail = await this.repository.inspect(
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
    const files = this.ruins
      .filter((r) => inScope(r.path, this.scope, this.direct))
      .map((r) => r.file);
    let layout = this.layout;
    if (this.scope || this.direct) {
      void this.visibleCity;
      layout = this.scopedLayouts.get(key)!;
    }
    const buildings = layout.build(files).buildings;
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
    let layout = this.scopedLayouts.get(key);
    if (!layout) {
      layout = createCityLayout(
        this.repository.allPaths.filter((p) =>
          inScope(p, this.scope, this.direct),
        ),
      );
      this.scopedLayouts.set(key, layout);
      if (this.scopedLayouts.size > 12)
        this.scopedLayouts.delete(this.scopedLayouts.keys().next().value!);
    }
    const city = layout.build(
      this.city.buildings.filter((b) =>
        inScope(b.path, this.scope, this.direct),
      ),
    );
    this.scopedView = { key, source: this.city, city };
    return city;
  }
  get visibleBuildings() {
    return this.visibleCity.buildings;
  }
  projectBuilding(building: Building) {
    if (!this.scope && !this.direct) return building;
    void this.visibleCity;
    return this.scopedLayouts
      .get(JSON.stringify([this.scope, this.direct]))!
      .build([building]).buildings[0]!;
  }
  private refreshTerritories() {
    this.territories = this.atlas.territories(this.scope, this.city.buildings);
  }
  private atlasFitZoom() {
    return Math.max(
      0.01,
      Math.min(
        (this.viewport.width - 4) / 280,
        (this.viewport.height - 2) / 58,
      ),
    );
  }
  private fitScope() {
    this.fitBuildings(
      this.visibleBuildings.length
        ? this.visibleBuildings
        : this.visibleRuinBuildings,
      1.4,
    );
    if (
      !this.direct &&
      this.atlas.hasChildren(this.scope) &&
      this.visibleBuildings.length > 120 &&
      this.zoomTarget < 0.35
    )
      this.atlasMode = true;
    if (this.atlasMode) {
      this.zoomTarget = this.atlasFitZoom();
      this.cameraTarget = {
        x: 140 - this.viewport.width / (2 * this.zoomTarget),
        y: 29 - this.viewport.height / (2 * this.zoomTarget),
      };
    }
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
    // Coordinate spaces change between atlas and streets; interpolate only
    // within the destination space, never through unrelated world coordinates.
    this.settleCamera();
    this.zoom *= 0.85;
    this.camera.x -=
      this.viewport.width / (2 * this.zoom) -
      this.viewport.width / (2 * this.zoomTarget);
    this.camera.y -=
      this.viewport.height / (2 * this.zoom) -
      this.viewport.height / (2 * this.zoomTarget);
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
      const result = method
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
    this.onOpenUrl(
      `${base}/blob/${this.repository.commits[this.selectedRuin?.lastIndex ?? this.index]!.hash}/${this.selected.split("/").map(encodeURIComponent).join("/")}`,
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

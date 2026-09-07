export interface FileChange {
  path: string;
  status: "added" | "modified" | "deleted";
  added?: number;
  removed?: number;
}

export interface Commit {
  hash: string;
  date: string;
  author: string;
  subject: string;
  changes: FileChange[];
}

export interface RepoFile {
  path: string;
  directory: string;
  language: string;
  size: number;
  lines?: number;
  commits: number;
  contributors: number;
  createdAt: string;
  lastModified: string;
}

export interface Repository {
  name: string;
  root: string;
  commits: Commit[];
  allPaths: string[];
  githubUrl?: string;
  snapshot(index: number): Promise<RepoFile[]>;
  inspect(index: number, path: string): Promise<RepoFile | undefined>;
  preview?(index: number, path: string): Promise<FileContent>;
  diff?(index: number, path: string): Promise<FileContent>;
  dispose(): Promise<void>;
}

export interface FileContent {
  text: string;
  binary: boolean;
  truncated: boolean;
}

export interface LoadOptions {
  exclude?: string[];
  onProgress?: (message: string) => void;
  signal?: AbortSignal;
}

export interface Building extends RepoFile {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

export interface District {
  path: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  buildings: Building[];
}

export interface City {
  districts: District[];
  buildings: Building[];
  width: number;
  height: number;
}

export interface CityLayout {
  build(files: RepoFile[]): City;
}

export interface AppOptions {
  history: boolean;
  speed: number;
}

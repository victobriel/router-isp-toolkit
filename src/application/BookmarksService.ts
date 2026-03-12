import {
  BOOKMARKS_STORAGE_KEY,
  MAX_BOOKMARK_CREDENTIALS,
} from "./constants/index.js";
import type {
  BookmarkStore,
  ModelBookmarks,
  CredentialBookmark,
} from "./types/index.js";
import type { IStorage } from "./ports/IStorage.js";
import { defaultStorage } from "../infra/storage/StorageService.js";

export interface BookmarkSummary {
  total: number;
  entries: Array<[string, ModelBookmarks]>;
}

export class BookmarksService {
  constructor(private readonly storage: IStorage) {}

  private async loadStore(): Promise<BookmarkStore> {
    const store =
      (await this.storage.get<BookmarkStore>(BOOKMARKS_STORAGE_KEY)) ?? {};
    return store;
  }

  private async saveStore(store: BookmarkStore): Promise<void> {
    await this.storage.save(BOOKMARKS_STORAGE_KEY, store);
  }

  public async listByModel(
    model: string
  ): Promise<ModelBookmarks | null> {
    const store = await this.loadStore();
    const entry = store[model];
    return entry ?? null;
  }

  public async addCredential(
    model: string,
    credential: CredentialBookmark
  ): Promise<
    | { kind: "ok"; entry: ModelBookmarks }
    | { kind: "max_reached"; max: number }
  > {
    const store = await this.loadStore();
    const existing = store[model] ?? {
      model,
      credentials: [] as CredentialBookmark[],
    };

    const updatedCredentials = [...existing.credentials];

    if (updatedCredentials.length >= MAX_BOOKMARK_CREDENTIALS) {
      return { kind: "max_reached", max: MAX_BOOKMARK_CREDENTIALS };
    }

    updatedCredentials.push(credential);

    const entry: ModelBookmarks = {
      model,
      credentials: updatedCredentials.slice(0, MAX_BOOKMARK_CREDENTIALS),
    };

    store[model] = entry;
    await this.saveStore(store);

    return { kind: "ok", entry };
  }

  public async removeCredential(
    model: string,
    index: number
  ): Promise<ModelBookmarks | null> {
    const store = await this.loadStore();
    const existing = store[model];
    if (!existing) return null;

    const updated = [...existing.credentials];
    if (index < 0 || index >= updated.length) return existing;

    updated.splice(index, 1);

    if (updated.length === 0) {
      delete store[model];
      await this.saveStore(store);
      return null;
    }

    const entry: ModelBookmarks = { model: existing.model, credentials: updated };
    store[model] = entry;
    await this.saveStore(store);
    return entry;
  }

  public async getSummary(): Promise<BookmarkSummary> {
    const store = await this.loadStore();
    const entries = Object.entries(store).filter(
      ([, entry]) => entry.credentials.length > 0
    );
    const total = entries.reduce(
      (sum, [, entry]) => sum + entry.credentials.length,
      0
    );
    return { total, entries };
  }
}

export const defaultBookmarksService = new BookmarksService(defaultStorage);


import { BOOKMARKS_STORAGE_KEY } from '@/application/constants/index';
import type { BookmarkStore, ModelBookmarks, CredentialBookmark } from '@/application/types/index';
import type { IStorage } from '@/application/ports/IStorage';

export interface BookmarkSummary {
  total: number;
  entries: Array<[string, ModelBookmarks]>;
}

export class BookmarksService {
  constructor(private readonly storage: IStorage) {}

  private async loadStore(): Promise<BookmarkStore> {
    const store = (await this.storage.get<BookmarkStore>(BOOKMARKS_STORAGE_KEY)) ?? {};
    return store;
  }

  private async saveStore(store: BookmarkStore): Promise<void> {
    await this.storage.save(BOOKMARKS_STORAGE_KEY, store);
  }

  public async listByModel(model: string): Promise<ModelBookmarks | null> {
    const store = await this.loadStore();
    const entry = store[model];
    return entry ?? null;
  }

  public async addCredential(
    model: string,
    credential: Omit<CredentialBookmark, 'id'>,
  ): Promise<ModelBookmarks> {
    const store = await this.loadStore();
    const existing = store[model] ?? {
      model,
      credentials: [] as CredentialBookmark[],
    };

    const updatedCredentials = [...existing.credentials];

    updatedCredentials.push({ ...credential, id: crypto.randomUUID() });

    const bookmarks: ModelBookmarks = {
      model,
      credentials: updatedCredentials,
    };

    store[model] = bookmarks;
    await this.saveStore(store);

    return bookmarks;
  }

  public async removeCredential(routerModel: string, id: string): Promise<ModelBookmarks | null> {
    const store = await this.loadStore();
    const existing = store[routerModel];
    if (!existing) return null;

    const updated = [...existing.credentials];
    const bookmark = updated.find((bookmark) => bookmark.id === id);
    if (!bookmark) return existing;
    updated.splice(updated.indexOf(bookmark), 1);

    if (updated.length === 0) {
      delete store[routerModel];
      await this.saveStore(store);
      return null;
    }

    const entry: ModelBookmarks = {
      model: existing.model,
      credentials: updated,
    };
    store[routerModel] = entry;
    await this.saveStore(store);
    return entry;
  }

  public async getSummary(): Promise<BookmarkSummary> {
    const store = await this.loadStore();
    const entries = Object.entries(store).filter(([, entry]) => entry.credentials.length > 0);
    const total = entries.reduce((sum, [, entry]) => sum + entry.credentials.length, 0);
    return { total, entries };
  }
}

type CredentialBookmark = { username: string; password: string };
type ModelBookmarks = { model: string; credentials: CredentialBookmark[] };
type BookmarkStore = Record<string, ModelBookmarks>;

export { type CredentialBookmark, type ModelBookmarks, type BookmarkStore };

export enum ThemeChoice {
  LIGHT = "light",
  DARK = "dark",
  SYSTEM = "system",
}

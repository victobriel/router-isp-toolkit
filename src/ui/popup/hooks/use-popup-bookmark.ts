import { defaultBookmarksService } from '@/application/BookmarksService';
import { CredentialBookmark, PopupStatusType } from '@/application/types';
import { useCallback, useEffect, useState } from 'react';
import { usePopupStatus } from '@/ui/popup/contexts/popup-status-context';

interface UsePopupBookmarkProps {
  routerModel: string;
}

export const usePopupBookmark = ({ routerModel }: UsePopupBookmarkProps) => {
  const [bookmarks, setBookmarks] = useState<CredentialBookmark[]>([]);
  const { setStatus, setStatusMessage } = usePopupStatus();

  const loadBookmarks = useCallback(async (model: string) => {
    const entry = await defaultBookmarksService.listByModel(model);
    if (entry) {
      setBookmarks(entry.credentials);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      if (routerModel) {
        await loadBookmarks(routerModel);
      }
    })();
  }, [routerModel, loadBookmarks]);

  const saveCredential = useCallback(
    async (username: string, password: string) => {
      if (!username || !password) {
        setStatus(PopupStatusType.WARN);
        setStatusMessage('Username and password are required.');
        return;
      }

      const result = await defaultBookmarksService.addCredential(routerModel, {
        username,
        password,
      });

      if (result.kind === 'max_reached') {
        setStatus(PopupStatusType.WARN);
        setStatusMessage(`Maximum of ${result.max} saved credentials reached.`);
        return;
      }

      await loadBookmarks(routerModel);

      setStatus(PopupStatusType.OK);
      setStatusMessage('Credentials saved.');
    },
    [routerModel, loadBookmarks, setStatus, setStatusMessage],
  );

  const deleteCredential = useCallback(
    async (id: string) => {
      await defaultBookmarksService.removeCredential(routerModel, id);
      await loadBookmarks(routerModel);

      setStatus(PopupStatusType.OK);
      setStatusMessage('Credentials removed.');
    },
    [routerModel, loadBookmarks, setStatus, setStatusMessage],
  );

  const fillLoginFields = useCallback(
    (id: string, tabId: number) => {
      if (tabId !== null) {
        const bookmark = bookmarks.find((bookmark) => bookmark.id === id);
        if (!bookmark) return;
        const { username, password } = bookmark;
        void chrome.tabs.sendMessage(tabId, {
          action: 'fillLoginFields',
          credentials: { username, password },
        });
      }
    },
    [bookmarks],
  );

  return {
    bookmarks,
    saveCredential,
    fillLoginFields,
    deleteCredential,
  };
};

import { CredentialBookmark, PopupStatusType } from '@/application/types';
import { useCallback, useEffect, useState } from 'react';
import { usePopupStatus } from '@/ui/modules/popup/contexts/popup-status-context';
import { services } from '@/index';
import { translator } from '@/infra/i18n/I18nService';

// Composition-root wiring for this UI entrypoint.
const { bookmarksService } = services;

interface UsePopupBookmarkProps {
  routerModel: string;
}

export const usePopupBookmark = ({ routerModel }: UsePopupBookmarkProps) => {
  const [bookmarks, setBookmarks] = useState<CredentialBookmark[]>([]);
  const { setStatus, setStatusMessage } = usePopupStatus();

  const loadBookmarks = useCallback(async (model: string) => {
    const entry = await bookmarksService.listByModel(model);
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
        setStatusMessage(translator.t('popup_error_save_missing_fields'));
        return;
      }

      const result = await bookmarksService.addCredential(routerModel, {
        username,
        password,
      });

      if (result.kind === 'max_reached') {
        setStatus(PopupStatusType.WARN);
        setStatusMessage(translator.t('popup_error_max_bookmarks'));
        return;
      }

      await loadBookmarks(routerModel);

      setStatus(PopupStatusType.OK);
      setStatusMessage(translator.t('popup_status_bookmark_saved'));
    },
    [routerModel, loadBookmarks, setStatus, setStatusMessage],
  );

  const deleteCredential = useCallback(
    async (id: string) => {
      await bookmarksService.removeCredential(routerModel, id);
      await loadBookmarks(routerModel);

      setStatus(PopupStatusType.OK);
      setStatusMessage(translator.t('popup_status_bookmark_removed'));
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

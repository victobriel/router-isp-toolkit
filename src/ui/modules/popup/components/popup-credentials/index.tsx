import { useEffect, useState } from 'react';
import { Input } from '@/ui/components/ui/input';
import { CredentialBookmark } from '@/application/types';
import { Button } from '@/ui/components/ui/button';
import { BookmarkIcon, ChevronDown, ChevronUp, KeyRound, Save, Trash2 } from 'lucide-react';
import { usePopupBookmark } from '@/ui/modules/popup/hooks/use-popup-bookmark';
import { Badge } from '@/ui/components/ui/badge';
import { translator } from '@/infra/i18n/I18nService';

interface PopupCredentialsProps {
  tabId: number;
  routerModel: string;
  username: string;
  password: string;
  hasData: boolean;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
}

export const PopupCredentials = ({
  tabId,
  routerModel,
  username,
  password,
  hasData,
  onUsernameChange,
  onPasswordChange,
}: PopupCredentialsProps) => {
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [isExpanded, setIsExpanded] = useState(!hasData);

  const { bookmarks, saveCredential, fillLoginFields, deleteCredential } = usePopupBookmark({
    routerModel,
  });

  useEffect(() => {
    setIsExpanded(!hasData);
    setShowBookmarks(false);
  }, [hasData]);

  const handleSaveCredential = () => {
    void saveCredential(username, password);
  };

  const handleSelectBookmark = (bookmark: CredentialBookmark) => {
    onUsernameChange(bookmark.username);
    onPasswordChange(bookmark.password);
    fillLoginFields(bookmark.id, tabId);
  };

  const handleDeleteBookmark = (id: string) => {
    void deleteCredential(id);
  };

  const bookmarkList = (
    <div className="rounded-md border border-border bg-card divide-y divide-border">
      {bookmarks.map((bookmark) => (
        <div
          key={`${bookmark.username}-${bookmark.password}`}
          className="flex items-center justify-between px-2 py-1.5 hover:bg-muted/50 cursor-pointer group"
          role="button"
          tabIndex={0}
          onClick={() => handleSelectBookmark(bookmark)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleSelectBookmark(bookmark);
            }
          }}
        >
          <div className="min-w-0">
            <p className="text-xs font-medium truncate">{bookmark.username}</p>
            <p className="text-[10px] text-muted-foreground truncate">{bookmark.password}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 opacity-0 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              void handleDeleteBookmark(bookmark.id);
            }}
            aria-label={translator.t('popup_saved_credentials_delete_title')}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );

  if (!isExpanded) {
    return (
      <section className="px-4 py-1.5 space-y-1.5">
        <div className="flex items-center gap-2">
          <KeyRound className="size-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs font-medium truncate flex-1 min-w-0">{username || '—'}</span>
          <span className="text-xs text-muted-foreground font-mono tracking-widest">
            {'•'.repeat(Math.min(password.length || 6, 8))}
          </span>
          <div className="flex items-center gap-0.5 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 relative"
              onClick={() => setShowBookmarks((prev) => !prev)}
              disabled={bookmarks.length === 0}
              title={translator.t('popup_saved_credentials_title')}
            >
              <BookmarkIcon className="size-3.5" />
              {bookmarks.length > 0 && (
                <Badge
                  variant="warning"
                  className="bg-warning text-white absolute top-0 right-0 z-10 text-[9px] px-1 min-w-0 h-3.5 leading-none font-medium"
                >
                  {bookmarks.length}
                </Badge>
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setIsExpanded(true)}
              title={translator.t('popup_action_edit_credentials')}
            >
              <ChevronDown className="size-3.5" />
            </Button>
          </div>
        </div>
        {showBookmarks && bookmarkList}
      </section>
    );
  }

  return (
    <section className="space-y-1.5 px-4 pt-3 pb-2">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          {translator.t('popup_credentials_title')}
        </p>
        {hasData && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 -mr-0.5"
            onClick={() => setIsExpanded(false)}
            title={translator.t('popup_action_collapse')}
          >
            <ChevronUp className="size-3.5" />
          </Button>
        )}
      </div>
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
        <div className="space-y-1">
          <label
            className="text-xs text-muted-foreground uppercase tracking-wider font-medium"
            htmlFor="popup-username"
          >
            {translator.t('popup_credentials_user_label')}
          </label>
          <Input
            id="popup-username"
            type="text"
            value={username}
            onChange={(e) => onUsernameChange(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <label
            className="text-xs text-muted-foreground uppercase tracking-wider font-medium"
            htmlFor="popup-password"
          >
            {translator.t('popup_credentials_password_label')}
          </label>
          <Input
            id="popup-password"
            type="password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handleSaveCredential}
            title={translator.t('popup_credentials_save_aria_label')}
          >
            <Save className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowBookmarks((prev) => !prev)}
            disabled={bookmarks.length === 0}
            title={translator.t('popup_saved_credentials_title')}
            className="relative"
          >
            <BookmarkIcon className="size-4" />
            {bookmarks.length > 0 && (
              <Badge
                variant="warning"
                className="bg-warning text-white absolute -top-2 -right-2 z-10"
              >
                {bookmarks.length}
              </Badge>
            )}
          </Button>
        </div>
      </div>
      {showBookmarks && bookmarkList}
    </section>
  );
};

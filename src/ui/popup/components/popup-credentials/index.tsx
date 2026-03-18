import { useState } from 'react';
import { Input } from '@/ui/components/ui/input';
import { CredentialBookmark, PopupStatusType } from '@/application/types';
import { Button } from '@/ui/components/ui/button';
import { BookmarkIcon, Save, Trash2 } from 'lucide-react';
import { usePopupBookmark } from '@/ui/popup/hooks/use-popup-bookmark';
import { usePopupStatus } from '@/ui/popup/contexts/popup-status-context';
import { Badge } from '@/ui/components/ui/badge';

interface PopupCredentialsProps {
  tabId: number;
  routerModel: string;
  username: string;
  password: string;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
}

export const PopupCredentials = ({
  tabId,
  routerModel,
  username,
  password,
  onUsernameChange,
  onPasswordChange,
}: PopupCredentialsProps) => {
  const [showBookmarks, setShowBookmarks] = useState(false);

  const { bookmarks, saveCredential, fillLoginFields, deleteCredential } = usePopupBookmark({
    routerModel,
  });
  const { setStatus, setStatusMessage } = usePopupStatus();

  const handleSaveCredential = () => {
    void saveCredential(username, password);
    setStatus(PopupStatusType.OK);
    setStatusMessage('Credentials saved.');
  };

  const handleSelectBookmark = (bookmark: CredentialBookmark) => {
    onUsernameChange(bookmark.username);
    onPasswordChange(bookmark.password);
    fillLoginFields(bookmark.id, tabId);
  };

  const handleDeleteBookmark = (id: string) => {
    void deleteCredential(id);
    setStatus(PopupStatusType.OK);
    setStatusMessage('Credentials removed.');
  };

  return (
    <section className="space-y-1.5 px-4 pt-4">
      <p className="text-sm uppercase tracking-wider text-muted-foreground font-semibold">
        Credentials
      </p>
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
        <div className="space-y-1">
          <label
            className="text-xs text-muted-foreground uppercase tracking-wider font-medium"
            htmlFor="popup-username"
          >
            Username
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
            Password
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
            title="Save credentials"
          >
            <Save className="size-5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowBookmarks((prev) => !prev)}
            disabled={bookmarks.length === 0}
            title="Saved credentials"
            className="relative"
          >
            <BookmarkIcon className="size-5" />
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
      {showBookmarks && (
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
                aria-label="Delete credential"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

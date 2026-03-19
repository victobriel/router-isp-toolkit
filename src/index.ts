import type { IStorage } from '@/application/ports/IStorage';
import type { IDomGateway } from '@/application/ports/IDomGateway';
import type { IRouterFactory } from '@/application/ports/IRouterFactory';
import type { ITabMessenger } from '@/application/ports/ITabMessenger';

import { BookmarksService } from '@/application/BookmarksService';
import { CollectionService } from '@/application/CollectionService';
import { ContentPageUseCase } from '@/application/ContentPageUseCase';
import { PopupUiStateService } from '@/application/PopupUiStateService';

import { DomGateway } from '@/infra/dom/DomGateway';
import { RouterFactoryAdapter } from '@/infra/router/RouterFactoryAdapter';
import { defaultTabMessenger } from '@/infra/tabs/ChromeTabMessenger';

import { defaultStorage } from '@/infra/storage/StorageService';
import { defaultSessionStorageService } from '@/infra/storage/SessionStorageService';

export type CompositionServices = {
  storage: IStorage;
  sessionStorage: IStorage;

  routerFactory: IRouterFactory;
  domGateway: IDomGateway;
  tabMessenger: ITabMessenger;

  bookmarksService: BookmarksService;
  popupUiStateService: PopupUiStateService;
  collectionService: CollectionService;
  contentPageUseCase: ContentPageUseCase;
};

/**
 * Single-file composition root (no DI container).
 *
 * - `services` is used by extension entrypoints.
 * - `createServices()` exists to support swapping dependencies in tests.
 */
export function createServices({
  storage = defaultStorage,
  sessionStorage = defaultSessionStorageService,
  routerFactory = new RouterFactoryAdapter(),
  domGateway = new DomGateway(),
  tabMessenger = defaultTabMessenger,
}: Partial<
  Pick<
    CompositionServices,
    'storage' | 'sessionStorage' | 'routerFactory' | 'domGateway' | 'tabMessenger'
  >
> = {}): CompositionServices {
  const collectionService = new CollectionService(routerFactory, sessionStorage);
  const contentPageUseCase = new ContentPageUseCase(
    routerFactory,
    storage,
    sessionStorage,
    domGateway,
    collectionService,
  );

  const bookmarksService = new BookmarksService(storage);
  const popupUiStateService = new PopupUiStateService(sessionStorage);

  return {
    storage,
    sessionStorage,
    routerFactory,
    domGateway,
    tabMessenger,
    bookmarksService,
    popupUiStateService,
    collectionService,
    contentPageUseCase,
  };
}

export const services = createServices();

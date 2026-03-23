import type { IStorage } from '@/application/ports/IStorage';
import type { IDomGateway } from '@/application/ports/IDomGateway';
import type { IRouterFactory } from '@/application/ports/IRouterFactory';
import type { ITabMessenger } from '@/application/ports/ITabMessenger';

import { BookmarksService } from '@/application/BookmarksService';
import { CollectionService } from '@/application/CollectionService';
import { ContentPageUseCase } from '@/application/ContentPageUseCase';
import { PopupUiStateService } from '@/application/PopupUiStateService';

import { DomService } from '@/infra/dom/DomService';
import { RouterFactoryAdapter } from '@/infra/router/RouterFactoryAdapter';

import { SessionStorageService } from '@/infra/storage/SessionStorageService';
import { StorageService } from './infra/storage/StorageService';
import { ChromeTabMessenger } from './infra/tabs/ChromeTabMessenger';

export type CompositionServices = {
  storage: IStorage;
  sessionStorage: IStorage;

  routerFactory: IRouterFactory;
  domService: IDomGateway;
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
  storage = new StorageService(),
  sessionStorage = new SessionStorageService(),
  domService = new DomService(),
  routerFactory = new RouterFactoryAdapter(domService),
  tabMessenger = new ChromeTabMessenger(),
}: Partial<
  Pick<
    CompositionServices,
    'storage' | 'sessionStorage' | 'routerFactory' | 'domService' | 'tabMessenger'
  >
> = {}): CompositionServices {
  const collectionService = new CollectionService(routerFactory, sessionStorage);
  const contentPageUseCase = new ContentPageUseCase(
    routerFactory,
    storage,
    sessionStorage,
    domService,
    collectionService,
  );

  const bookmarksService = new BookmarksService(storage);
  const popupUiStateService = new PopupUiStateService(sessionStorage);

  return {
    storage,
    sessionStorage,
    routerFactory,
    domService,
    tabMessenger,
    bookmarksService,
    popupUiStateService,
    collectionService,
    contentPageUseCase,
  };
}

export const services = createServices();

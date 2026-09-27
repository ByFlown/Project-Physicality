import { clear, createStore, del, get, set, type UseStore } from 'idb-keyval';

/**
 * Optional on-device storage for scan photos. Kept in its own IndexedDB
 * database so photos never touch the app-data journal or JSON backups.
 */

export type PhotoView = 'front' | 'side';

let store: UseStore | undefined;
function db(): UseStore {
  store ??= createStore('project-physicality-photos', 'kv');
  return store;
}

const key = (scanId: string, view: PhotoView) => `${scanId}:${view}`;

export async function putScanPhoto(scanId: string, view: PhotoView, blob: Blob): Promise<void> {
  await set(key(scanId, view), blob, db());
}

export async function getScanPhoto(scanId: string, view: PhotoView): Promise<Blob | undefined> {
  return get<Blob>(key(scanId, view), db());
}

export async function deleteScanPhotos(scanId: string): Promise<void> {
  await Promise.all([del(key(scanId, 'front'), db()), del(key(scanId, 'side'), db())]);
}

export async function clearScanPhotos(): Promise<void> {
  await clear(db());
}

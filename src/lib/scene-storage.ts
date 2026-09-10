import type { Asset } from './scene';
import { validateScene, type AstraScene } from './scene-manifest';

const DATABASE = 'astra-scenes';
const VERSION = 1;
const ACTIVE_SCENE = 'active';

export type StoredScene = { scene: AstraScene; assets: Asset[]; missingAssetIds: string[] };

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('scenes')) database.createObjectStore('scenes', { keyPath: 'id' });
      if (!database.objectStoreNames.contains('assets')) database.createObjectStore('assets', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Could not open scene storage. Check browser storage permissions.'));
    request.onblocked = () => reject(new Error('Close other Astra tabs and retry scene storage.'));
  });
}

export async function saveScene(scene: AstraScene, assets: Asset[]): Promise<void> {
  const errors = validateScene(scene);
  if (errors.length) throw new Error(`Scene was not saved: ${errors.join(' ')}`);
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(['scenes', 'assets'], 'readwrite');
    transaction.objectStore('scenes').put({ ...scene, id: ACTIVE_SCENE });
    for (const asset of assets) transaction.objectStore('assets').put(asset);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(new Error('Could not save the scene. Browser storage may be full or unavailable.')); };
    transaction.onabort = () => { database.close(); reject(new Error('Could not save the scene. Browser storage may be full or unavailable.')); };
  });
}

export async function loadScene(): Promise<StoredScene | undefined> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['scenes', 'assets'], 'readonly');
    const sceneRequest = transaction.objectStore('scenes').get(ACTIVE_SCENE);
    const assetsRequest = transaction.objectStore('assets').getAll();
    transaction.oncomplete = () => {
      database.close();
      const raw = sceneRequest.result as AstraScene | undefined;
      if (!raw) return resolve(undefined);
      const errors = validateScene(raw);
      if (errors.length) return reject(new Error(`Saved scene is invalid: ${errors.join(' ')}`));
      const assets = assetsRequest.result as Asset[];
      const available = new Set(assets.map(asset => asset.id));
      resolve({ scene: raw, assets, missingAssetIds: raw.instances.map(instance => instance.assetId).filter(id => !available.has(id)) });
    };
    transaction.onerror = () => { database.close(); reject(new Error('Could not read the saved scene.')); };
  });
}

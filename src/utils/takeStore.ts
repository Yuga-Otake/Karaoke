// Saved song recordings, kept in IndexedDB (audio blobs are too big for localStorage).

export interface Take {
  id: string
  songId: string
  date: string
  score: number
  from: number           // bar range sung
  to: number
  transpose: number
  speed: number
  notes: { idx: number; midi: number; start: number; end: number; lyric?: string; bar: number }[]
  frames: { t: number; midi: number | null }[]
  scores: [number, number][]   // note idx → score
  offset: number         // take-clock seconds at audio position 0
  length: number         // take-clock seconds
  blob: Blob
}

const DB = 'voiceTraining'
const STORE = 'takes'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' }).createIndex('songId', 'songId')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const req = fn(t.objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    t.oncomplete = () => db.close()
  })
}

export async function saveTake(take: Take): Promise<void> {
  await tx('readwrite', s => s.put(take))
}

export async function listTakes(songId: string): Promise<Take[]> {
  try {
    const all = await tx<Take[]>('readonly', s => s.index('songId').getAll(songId))
    return all.sort((a, b) => b.date.localeCompare(a.date))
  } catch { return [] }
}

export async function deleteTake(id: string): Promise<void> {
  await tx('readwrite', s => s.delete(id))
}

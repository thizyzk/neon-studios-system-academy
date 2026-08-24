(function () {
  "use strict";

  const DATABASE_NAME = "neon-academy-local-assets";
  const STORE_NAME = "assets";
  const DATABASE_VERSION = 1;
  const MAX_ITEMS = 60;
  const MAX_ITEM_BYTES = 25 * 1024 * 1024;

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.addEventListener("upgradeneeded", () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("createdAt", "createdAt");
          store.createIndex("kind", "kind");
        }
      });
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
  }

  async function run(mode, callback) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      let result;
      try {
        result = callback(store, transaction);
      } catch (error) {
        database.close();
        reject(error);
        return;
      }
      transaction.addEventListener("complete", () => {
        database.close();
        resolve(result);
      }, { once: true });
      transaction.addEventListener("error", () => {
        database.close();
        reject(transaction.error);
      }, { once: true });
      transaction.addEventListener("abort", () => {
        database.close();
        reject(transaction.error || new Error("Local cache transaction aborted."));
      }, { once: true });
    });
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
  }

  async function list() {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const records = await requestResult(transaction.objectStore(STORE_NAME).getAll());
      return records.sort((left, right) => right.createdAt - left.createdAt);
    } finally {
      database.close();
    }
  }

  async function get(id) {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(STORE_NAME, "readonly");
      return await requestResult(transaction.objectStore(STORE_NAME).get(id));
    } finally {
      database.close();
    }
  }

  async function put(record) {
    const existing = await list();
    const replacing = existing.some((item) => item.id === record.id);
    if (!replacing && existing.length >= MAX_ITEMS) {
      throw new Error("CacheItemLimit");
    }
    const bytes = record.blob?.size ?? new Blob([String(record.content || "")]).size;
    if (bytes > MAX_ITEM_BYTES) throw new Error("CacheItemTooLarge");
    const normalized = {
      id: String(record.id || crypto.randomUUID()),
      name: String(record.name || "item-local").slice(0, 120),
      kind: String(record.kind || "file").slice(0, 32),
      mimeType: String(record.mimeType || record.blob?.type || "application/octet-stream").slice(0, 120),
      blob: record.blob instanceof Blob ? record.blob : null,
      content: typeof record.content === "string" ? record.content : "",
      createdAt: Number.isFinite(record.createdAt) ? record.createdAt : Date.now(),
      updatedAt: Date.now(),
      bytes,
    };
    await run("readwrite", (store) => store.put(normalized));
    return normalized;
  }

  async function remove(id) {
    await run("readwrite", (store) => store.delete(String(id)));
  }

  window.NeonAssetCache = Object.freeze({
    MAX_ITEMS,
    MAX_ITEM_BYTES,
    list,
    get,
    put,
    remove,
  });
})();

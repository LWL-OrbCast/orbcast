/**
 * HL agent key storage — AES-GCM encrypted at rest in IndexedDB.
 *
 * The key material is wrapped with a **non-extractable** WebCrypto key that
 * lives in the same DB. That does not stop a live same-origin XSS from
 * *using* the key (CSP is the defence for that), but it does stop:
 *  - plaintext reads of the private key from IndexedDB dumps / disk copies,
 *  - trivial `indexedDB` exfiltration of raw key material,
 *  - another wallet on the same browser profile reading a previous user's
 *    agent (records are scoped per master address).
 *
 * If decryption ever fails (wrap key lost, corrupted record) we return null;
 * the kernel then generates a fresh agent and re-runs approveAgent, so the
 * failure mode is one extra confirmation, never a locked-out user.
 */

const DB_NAME = 'hip4-web-agent';
const STORE = 'kv';
const WRAP_KEY_ID = 'wrapkey_v1';

export type AgentNetwork = 'mainnet' | 'testnet';

export type StoredAgent = {
  privateKey: `0x${string}`;
  address: `0x${string}`;
};

type EncryptedRecord = {
  v: 2;
  iv: Uint8Array;
  ct: ArrayBuffer;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(key);
    r.onsuccess = () => resolve((r.result as T | undefined) ?? null);
    r.onerror = () => reject(r.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Insert only if absent — loses gracefully when another tab won the race. */
async function idbAdd(key: string, value: unknown): Promise<boolean> {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).add(value, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => {
      e.preventDefault?.();
      resolve(false);
    };
    tx.onabort = () => resolve(false);
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getWrapKey(): Promise<CryptoKey> {
  const existing = await idbGet<CryptoKey>(WRAP_KEY_ID);
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  // add() so two tabs racing cannot overwrite each other's wrap key and
  // orphan an already-encrypted record.
  await idbAdd(WRAP_KEY_ID, key);
  return (await idbGet<CryptoKey>(WRAP_KEY_ID)) ?? key;
}

function legacyKeyFor(network: AgentNetwork): string {
  return `agent_${network}`;
}

function keyFor(network: AgentNetwork, owner: string): string {
  return `agent_v2_${network}_${owner.toLowerCase()}`;
}

async function encryptAgent(agent: StoredAgent): Promise<EncryptedRecord> {
  const wrap = await getWrapKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    wrap,
    new TextEncoder().encode(JSON.stringify(agent)),
  );
  return { v: 2, iv, ct };
}

async function decryptAgent(record: EncryptedRecord): Promise<StoredAgent | null> {
  try {
    const wrap = await getWrapKey();
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: record.iv as Uint8Array<ArrayBuffer> },
      wrap,
      record.ct,
    );
    const parsed = JSON.parse(new TextDecoder().decode(plain)) as StoredAgent;
    if (!parsed?.privateKey || !parsed?.address) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Pre-v2 records were plaintext JSON and not scoped to a wallet. */
async function migrateLegacyAgent(
  network: AgentNetwork,
  owner: string,
): Promise<StoredAgent | null> {
  const raw = await idbGet<string>(legacyKeyFor(network));
  if (typeof raw !== 'string' || !raw) return null;
  let parsed: StoredAgent | null = null;
  try {
    const candidate = JSON.parse(raw) as StoredAgent;
    if (candidate?.privateKey && candidate?.address) parsed = candidate;
  } catch {
    /* corrupted legacy record — drop it below */
  }
  if (parsed) {
    await idbSet(keyFor(network, owner), await encryptAgent(parsed));
  }
  await idbDelete(legacyKeyFor(network));
  return parsed;
}

export async function loadAgent(
  network: AgentNetwork,
  owner: string,
): Promise<StoredAgent | null> {
  const record = await idbGet<EncryptedRecord>(keyFor(network, owner));
  if (record && record.v === 2) return decryptAgent(record);
  return migrateLegacyAgent(network, owner);
}

export async function saveAgent(
  network: AgentNetwork,
  owner: string,
  agent: StoredAgent,
): Promise<void> {
  await idbSet(keyFor(network, owner), await encryptAgent(agent));
}

/** Logout hygiene: drop this wallet's agent key (and any legacy record). */
export async function clearAgent(network: AgentNetwork, owner: string): Promise<void> {
  await idbDelete(keyFor(network, owner));
  await idbDelete(legacyKeyFor(network));
}

const STORE_NAME = 'sketchmentor-key-store'
const DB_NAME = 'sketchmentor-secure-storage'
const DB_VERSION = 1
const KEY_ID = 'mesh-api-key'
const CIPHER_STORAGE_KEY = 'sketchmentor.meshApiKeyCipher'

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME)
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function readCryptoKey() {
  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).get(KEY_ID)

    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error)
  })
}

async function writeCryptoKey(key) {
  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const request = transaction.objectStore(STORE_NAME).put(key, KEY_ID)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

async function clearCryptoKey() {
  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const request = transaction.objectStore(STORE_NAME).delete(KEY_ID)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

async function getOrCreateCryptoKey() {
  const existing = await readCryptoKey()

  if (existing) {
    return existing
  }

  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  await writeCryptoKey(key)
  return key
}

function bytesToBase64(bytes) {
  return btoa(String.fromCharCode(...bytes))
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
}

export async function saveEncryptedApiKey(apiKey) {
  const key = await getOrCreateCryptoKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(apiKey)
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)

  localStorage.setItem(
    CIPHER_STORAGE_KEY,
    JSON.stringify({
      iv: bytesToBase64(iv),
      cipher: bytesToBase64(new Uint8Array(cipher)),
    }),
  )
}

export async function loadEncryptedApiKey() {
  const stored = localStorage.getItem(CIPHER_STORAGE_KEY)

  if (!stored) {
    return ''
  }

  try {
    const payload = JSON.parse(stored)
    const key = await readCryptoKey()

    if (!key || !payload.iv || !payload.cipher) {
      return ''
    }

    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(payload.iv) },
      key,
      base64ToBytes(payload.cipher),
    )

    return new TextDecoder().decode(plain)
  } catch {
    await clearEncryptedApiKey()
    return ''
  }
}

export async function clearEncryptedApiKey() {
  localStorage.removeItem(CIPHER_STORAGE_KEY)
  await clearCryptoKey()
}

export function hasEncryptedApiKey() {
  return Boolean(localStorage.getItem(CIPHER_STORAGE_KEY))
}

/**
 * Google Drive REST API & Google Identity Services (GIS) Client
 * Provides OAuth 2.0 token management, folder discovery/creation, and multipart file upload.
 */

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (response: any) => void
            error_callback?: (err: any) => void
          }) => {
            requestAccessToken: (overrideConfig?: { prompt?: string }) => void
          }
          revoke?: (token: string, done: () => void) => void
        }
      }
    }
  }
}

const GDRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const STORAGE_KEY_CLIENT_ID = 'r27_google_client_id'

export function getStoredGoogleClientId(): string {
  const envId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  if (envId && typeof envId === 'string' && envId.trim() !== '') {
    return envId.trim()
  }
  return localStorage.getItem(STORAGE_KEY_CLIENT_ID) || ''
}

export function setStoredGoogleClientId(clientId: string): void {
  if (!clientId) {
    localStorage.removeItem(STORAGE_KEY_CLIENT_ID)
  } else {
    localStorage.setItem(STORAGE_KEY_CLIENT_ID, clientId.trim())
  }
}

/**
 * Dynamically loads Google Identity Services SDK
 */
export function loadGisScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve()
      return
    }
    const existing = document.getElementById('google-gis-script')
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('無法載入 Google 授權服務 (GIS)')))
      return
    }

    const script = document.createElement('script')
    script.id = 'google-gis-script'
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('無法載入 Google 授權服務 (GIS)'))
    document.body.appendChild(script)
  })
}

/**
 * Requests OAuth2 Access Token for Google Drive
 */
export async function requestGoogleDriveToken(clientId: string): Promise<{ accessToken: string; expiresIn: number }> {
  if (!clientId || clientId.trim() === '') {
    throw new Error('請先配置 Google OAuth Client ID')
  }

  await loadGisScript()

  return new Promise((resolve, reject) => {
    try {
      const client = window.google!.accounts.oauth2.initTokenClient({
        client_id: clientId.trim(),
        scope: GDRIVE_SCOPE,
        callback: (tokenResponse: any) => {
          if (tokenResponse.error) {
            reject(new Error(tokenResponse.error_description || tokenResponse.error || 'Google 授權失敗'))
            return
          }
          resolve({
            accessToken: tokenResponse.access_token,
            expiresIn: Number(tokenResponse.expires_in) || 3599,
          })
        },
        error_callback: (err: any) => {
          reject(new Error(err?.message || 'Google 授權流程中斷'))
        },
      })

      client.requestAccessToken({ prompt: 'consent' })
    } catch (err: any) {
      reject(new Error(err?.message || '初始化 Google 授權用戶端時發生錯誤'))
    }
  })
}

/**
 * Finds existing folder by name or creates a new one in the root of Google Drive
 */
export async function findOrCreateFolder(accessToken: string, folderName: string): Promise<string> {
  const safeName = folderName.trim().replace(/'/g, "\\'")
  const q = `name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`

  try {
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    )

    if (searchRes.ok) {
      const data = await searchRes.json()
      if (data.files && data.files.length > 0) {
        return data.files[0].id
      }
    }
  } catch (searchErr) {
    console.warn('Error searching for Google Drive folder:', searchErr)
  }

  // Create folder if not found
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName.trim(),
      mimeType: 'application/vnd.google-apps.folder',
    }),
  })

  if (!createRes.ok) {
    const errText = await createRes.text()
    throw new Error(`無法在 Google Drive 建立資料夾 (${createRes.status}): ${errText}`)
  }

  const folderData = await createRes.json()
  return folderData.id
}

/**
 * Uploads a file (Blob) to Google Drive using multipart upload
 */
export async function uploadFileToGoogleDrive({
  accessToken,
  folderId,
  fileName,
  mimeType = 'application/zip',
  blob,
}: {
  accessToken: string
  folderId?: string
  fileName: string
  mimeType?: string
  blob: Blob
}): Promise<{ id: string; name: string; webViewLink?: string }> {
  const metadata: Record<string, any> = {
    name: fileName,
    mimeType,
  }
  if (folderId) {
    metadata.parents = [folderId]
  }

  const boundary = '-------r27backup' + Date.now().toString(36)
  const delimiter = `\r\n--${boundary}\r\n`
  const closeDelimiter = `\r\n--${boundary}--`

  const arrayBuffer = await blob.arrayBuffer()
  const uint8Array = new Uint8Array(arrayBuffer)

  // Construct multipart body parts
  const metadataPart = delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`

  const enc = new TextEncoder()
  const metadataBytes = enc.encode(metadataPart)
  const closeBytes = enc.encode(closeDelimiter)

  const bodyBytes = new Uint8Array(metadataBytes.length + uint8Array.length + closeBytes.length)
  bodyBytes.set(metadataBytes, 0)
  bodyBytes.set(uint8Array, metadataBytes.length)
  bodyBytes.set(closeBytes, metadataBytes.length + uint8Array.length)

  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,size',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: bodyBytes,
    }
  )

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Google Drive 檔案上傳失敗 (${response.status}): ${errText}`)
  }

  return response.json()
}

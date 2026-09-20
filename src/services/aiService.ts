import { auth, firebaseConfig } from '@/lib/firebase'
import type { AIAssistantResponse, AIChatMessage } from '@/types/ai'

/**
 * Resolves the Cloud Function Endpoint URL
 */
function getEndpointUrl(): string {
  if (import.meta.env.VITE_AI_API_URL) {
    return import.meta.env.VITE_AI_API_URL
  }

  const projectId = firebaseConfig.projectId || 'r27-app-7c5bc'

  // If in localhost and emulators active
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    // Check if emulator port is configured
    if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
      return `http://127.0.0.1:5001/${projectId}/us-central1/askAIAssistant`
    }
  }

  // Cloud Functions v2 endpoint URL
  return `https://us-central1-${projectId}.cloudfunctions.net/askAIAssistant`
}

/**
 * Calls Accounting AI Assistant Cloud Function
 */
export async function askAccountingAI(
  message: string,
  centerId: string,
  history: AIChatMessage[] = []
): Promise<AIAssistantResponse> {
  const currentUser = auth.currentUser
  if (!currentUser) {
    throw new Error('請先登入管理員帳號再使用 AI 助理。')
  }

  const idToken = await currentUser.getIdToken(true)
  const endpoint = getEndpointUrl()

  const conversationHistory = history.slice(-6).map((m) => ({
    role: m.role,
    content: m.content,
  }))

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      message,
      centerId,
      conversationHistory,
    }),
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null)
    const errorMsg = errorBody?.error || `後端請求失敗 (HTTP ${response.status})`
    throw new Error(errorMsg)
  }

  const result = await response.json()
  if (!result.ok || !result.data) {
    throw new Error(result.error || '後端回傳資料格式不符合預期')
  }

  return result.data as AIAssistantResponse
}

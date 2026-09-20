import * as admin from 'firebase-admin'
import { onRequest } from 'firebase-functions/v2/https'
import OpenAI from 'openai'
import { routeIntent } from './router'
import { executeAccountingAgent } from './agents/accountingAgent'
import { AIAssistantRequest } from './types'

export * from './types'

/**
 * 🤖 Accounting AI Assistant HTTPS Endpoint
 * Supports RBAC (Admin only) + Center Isolation + OpenAI gpt-5.6-luna
 */
export const askAIAssistant = onRequest(
  {
    cors: true,
    timeoutSeconds: 120,
    memory: '512MiB',
  },
  async (req, res) => {
    // 1. Only allow POST
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'Method Not Allowed' })
      return
    }

    try {
      // 2. Authenticate User ID Token from Authorization Header
      const authHeader = req.headers.authorization || ''
      if (!authHeader.startsWith('Bearer ')) {
        res.status(401).json({ ok: false, error: '未授權：缺少驗證 Token' })
        return
      }

      const idToken = authHeader.split('Bearer ')[1].trim()
      let decodedToken: admin.auth.DecodedIdToken
      try {
        decodedToken = await admin.auth().verifyIdToken(idToken)
      } catch (authErr: any) {
        console.warn('[AI Assistant] Token verification failed:', authErr?.message)
        res.status(401).json({ ok: false, error: '身分驗證無效或過期，請重新登入' })
        return
      }

      const uid = decodedToken.uid

      // 3. RBAC Check: Ensure user is admin
      const userDoc = await admin.firestore().collection('users').doc(uid).get()
      const userData = userDoc.data()
      const role = userData?.role || decodedToken.role

      if (role !== 'admin') {
        res.status(403).json({
          ok: false,
          error: '權限不足：會計 AI 助理僅限管理員 (admin) 使用。',
        })
        return
      }

      // 4. Validate Request Payload
      const { message, centerId = 'r27', conversationHistory = [] } = req.body as AIAssistantRequest
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        res.status(400).json({ ok: false, error: '請提供提問內容' })
        return
      }

      // 5. Check OPENAI_API_KEY
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) {
        res.status(500).json({
          ok: false,
          error: '後端尚未配置 OPENAI_API_KEY 環境變數，請在 Cloud Functions 或 Secrets Manager 中配置。',
        })
        return
      }

      const openai = new OpenAI({ apiKey })

      // 6. Stage 1: Intent & Domain Classifier (gpt-5.6-luna)
      const routeResult = await routeIntent(openai, message, centerId)

      if (!routeResult.isAccounting && routeResult.outOfScopeResponse) {
        res.status(200).json({
          ok: true,
          data: routeResult.outOfScopeResponse,
        })
        return
      }

      // 7. Stage 2: Accounting Specialized Agent with Tools (gpt-5.6-luna)
      const agentResponse = await executeAccountingAgent(openai, message, centerId, conversationHistory)

      res.status(200).json({
        ok: true,
        data: agentResponse,
      })
    } catch (err: any) {
      console.error('[AI Assistant] Global error:', err)
      res.status(500).json({
        ok: false,
        error: err?.message || '內部系統錯誤，請稍後重試',
      })
    }
  }
)

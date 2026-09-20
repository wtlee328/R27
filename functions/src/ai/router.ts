import OpenAI from 'openai'
import { Domain, AIAssistantResponse } from './types'

export interface RouteResult {
  domain: Domain
  isAccounting: boolean
  outOfScopeResponse?: AIAssistantResponse
}

const CLASSIFIER_MODEL = 'gpt-5.6-luna'

/**
 * Stage 1: Intent & Domain Classifier using gpt-5.6-luna
 */
export async function routeIntent(
  openai: OpenAI,
  userMessage: string,
  centerId: string
): Promise<RouteResult> {
  const prompt = `你是一個專業健身場館管理系統的意圖分類器。系統目前僅開放「會計與財務管理（Accounting）」功能。
請分析使用者的訊息，將其歸類為以下三個領域之一：
1. "accounting"：涉及會計、財務、收入、支出、流水帳、損益表、預收學費、銷課營收、合約款項、分期收款、退費、扣款、堂數金額換算等。
2. "out_of_scope"：涉及系統其他非會計功能，如學員個人隱私/病史/電話、教練排課排班/打卡、體驗課流程、非財務的合約法務、純營運分析等。
3. "general"：打招呼、寒暄、系統使用詢問、技術問題、或無關的閒聊。

請僅回傳 JSON 格式：{"domain": "accounting" | "out_of_scope" | "general", "reason": "簡短理由"}`

  try {
    const response = await openai.chat.completions.create({
      model: CLASSIFIER_MODEL,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_object' },
      reasoning_effort: 'none',
      temperature: 0.1,
    })

    const rawContent = response.choices[0]?.message?.content || '{}'
    const parsed = JSON.parse(rawContent)
    const domain: Domain = ['accounting', 'out_of_scope', 'general'].includes(parsed.domain)
      ? parsed.domain
      : 'accounting'

    if (domain === 'accounting') {
      return { domain: 'accounting', isAccounting: true }
    }

    // Generate friendly out-of-scope response
    const timestamp = Date.now()
    const messageId = `msg_${timestamp}`
    const conversationId = `conv_${timestamp}`

    let text = ''
    let suggestedQuestions = [
      '查詢本月課程收入明細',
      '目前累積的損益狀況如何？',
      '查看預收學費負債餘額與待履約堂數',
    ]

    if (domain === 'out_of_scope') {
      text =
        '您好！目前系統 AI 助理僅開放【會計與財務管理】領域諮詢（例如：流水收支、損益總覽、預收銷課勾稽、合約收款與分期狀況等）。\n\n您所詢問的「學員資料/教練排課/場館營運」等模組預計將於後續版本陸續開放，敬請期待！'
    } else {
      text =
        '您好！我是 R27 會計 AI 助理，專門為您提供場館財務與會計相關的數據查詢與分析。\n\n您可以向我詢問收入、支出、損益、預收款項與合約金流等問題。'
    }

    return {
      domain,
      isAccounting: false,
      outOfScopeResponse: {
        conversationId,
        messageId,
        domain,
        text,
        blocks: [
          {
            type: 'alert_box',
            data: {
              title: domain === 'out_of_scope' ? '功能範圍提示' : '歡迎使用會計 AI 助理',
              message: text,
              type: 'info',
            },
          },
        ],
        suggestedQuestions,
        metadata: {
          centerId,
          executedTools: [],
          timestamp,
        },
      },
    }
  } catch (error: any) {
    console.warn('[AI Router] Intent classification failed, falling back to heuristics:', error?.message)

    // Heuristic fallback
    const keywords = ['收', '支', '帳', '錢', '損益', '營收', '費用', '預收', '銷課', '合約', '款', '發票', '成本', '利潤']
    const isLikelyAccounting = keywords.some((k) => userMessage.includes(k))

    if (isLikelyAccounting) {
      return { domain: 'accounting', isAccounting: true }
    }

    const timestamp = Date.now()
    return {
      domain: 'general',
      isAccounting: false,
      outOfScopeResponse: {
        conversationId: `conv_${timestamp}`,
        messageId: `msg_${timestamp}`,
        domain: 'general',
        text: '您好！我是 R27 會計 AI 助理。目前專門協助您查詢與分析場館財務、流水收支、損益及合約款項。請問有什麼會計問題需要為您解答嗎？',
        blocks: [
          {
            type: 'alert_box',
            data: {
              title: '會計 AI 助理服務範圍',
              message: '您可以查詢各月份收入、支出、損益表及預收學費負債餘額等數據。',
              type: 'info',
            },
          },
        ],
        suggestedQuestions: ['查詢本月課程收入明細', '查看今年度累積損益狀況'],
        metadata: {
          centerId,
          executedTools: [],
          timestamp,
        },
      },
    }
  }
}

import OpenAI from 'openai'
import { Domain, AIAssistantResponse, ChatMessage } from './types'
import { getTaipeiDateTimeInfo } from './utils/timeUtils'

export interface RouteResult {
  domain: Domain
  isAccounting: boolean
  outOfScopeResponse?: AIAssistantResponse
}

const CLASSIFIER_MODEL = 'gpt-6-luna'

/**
 * Stage 1: Context-Aware Intent & Domain Classifier using gpt-6-luna
 * Now accepts conversationHistory to properly resolve elliptical follow-up questions
 * like "我要看去年", "那8月呢", "汪雪貞呢", "算成含稅是多少" without false-positive out_of_scope rejections.
 */
export async function routeIntent(
  openai: OpenAI,
  userMessage: string,
  centerId: string,
  conversationHistory: ChatMessage[] = []
): Promise<RouteResult> {
  const centerName = centerId === 'coffit' ? 'COFFIT' : 'R27'
  const trimmed = userMessage.trim()

  // ── 1. Follow-up Heuristic Protection (Zero-latency Contextual Bypass) ──
  // If the conversation already has prior accounting context, check if the current input
  // is an elliptical follow-up, time switch, person query, or detail expansion.
  if (conversationHistory.length > 0) {
    const previousMessages = conversationHistory.slice(-4)
    const hasPriorAccountingContext = previousMessages.some((m) => {
      const c = m.content || ''
      return (
        c.includes('收') ||
        c.includes('支') ||
        c.includes('損益') ||
        c.includes('營收') ||
        c.includes('合約') ||
        c.includes('預收') ||
        c.includes('銷課') ||
        c.includes('費用') ||
        c.includes('金額') ||
        c.includes('帳') ||
        c.includes('款')
      )
    })

    if (hasPriorAccountingContext) {
      // Common temporal modifiers / switches
      const timeKeywords = [
        '去年', '前年', '前天', '昨天', '今天', '明天', '上月', '上個月', '本月', '這個月',
        '下月', '下個月', '上季', '這季', '上週', '這週', '年度', '全年度', '上半年', '下半年',
        '最近', '月份', '年', '月', '日', '期間', '那時候', '當時'
      ]
      // Common conversational follow-up triggers
      const followUpKeywords = [
        '看', '改看', '我要看', '換看', '那', '呢', '還要', '也要', '那如果', '算成',
        '扣掉', '加上', '合計', '為什麼', '怎算', '明細', '細節', '展開', '清單', '多少', '還有'
      ]

      const isTemporalSwitch = timeKeywords.some((k) => trimmed.includes(k))
      const isConversationalFollowUp = followUpKeywords.some((k) => trimmed.includes(k))
      const isShortFollowUp = trimmed.length <= 15

      // If prior turn was accounting and user is asking a follow-up or temporal shift,
      // it is unambiguously an accounting continuation!
      if (isTemporalSwitch || isConversationalFollowUp || isShortFollowUp) {
        console.log(`[AI Router] ⚡ Contextual Fast-Path matched for "${trimmed}" (Prior accounting context detected). Directing to Accounting Agent.`)
        return { domain: 'accounting', isAccounting: true }
      }
    }
  }

  // ── 2. Context-Aware LLM Classification ──
  const timeInfo = getTaipeiDateTimeInfo()
  const prompt = `你是一個專業健身場館「會計 AI 助理」的意圖分類器。
【目前服務場館】：${centerName}
【現在時間（台灣時區 Asia/Taipei，UTC+8）】：${timeInfo.fullString}（今天日期：${timeInfo.dateStr}）

請分析使用者的訊息，判斷其是否屬於會計與財務管理領域：
1. "accounting"：
   - 包含所有直接或間接涉及會計、財務、收入、支出、流水帳、損益表、預收學費、銷課營收、合約款項、分期收款、退費、扣款、堂數金額換算等。
   - ⚠️ 特別注意【多輪對話上下文承接】：使用者經常使用省略句、代名詞、切換時間或補充條件（例如：「我要看去年」、「那8月呢？」、「汪雪貞呢？」、「算成含稅是多少？」、「詳細列出來」）。只要前次回話是在討論財務數據，而當前訊息是承接、追問、換時段、換對象或深入分析，【必須】判定為 "accounting"！
2. "out_of_scope"：
   - 使用者明確要求非會計的功能模組，例如教練排課排班打卡、場地租借操作、修改學員私人電話/病史等其他業務。
3. "general"：
   - 純粹的無實質意義打招呼（如「嗨」、「哈囉」、「早安」）、詢問助理身份、或與場館完全無關的閒聊（如天氣、講笑話）。

請僅回傳 JSON 格式：{"domain": "accounting" | "out_of_scope" | "general", "reason": "簡短理由"}`

  try {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: prompt },
    ]

    // Inject recent conversation turns into classification context
    if (conversationHistory && conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-4)
      for (const h of recentHistory) {
        if (h.role === 'user' || h.role === 'assistant') {
          messages.push({
            role: h.role,
            content: h.content.slice(0, 300),
          })
        }
      }
    }

    messages.push({ role: 'user', content: userMessage })

    const response = await openai.chat.completions.create({
      model: CLASSIFIER_MODEL,
      messages,
      response_format: { type: 'json_object' },
      reasoning_effort: 'low',
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
    const suggestedQuestions = [
      `查詢 ${centerName} 本月課程收入明細`,
      `目前 ${centerName} 累積的損益狀況如何？`,
      `查看 ${centerName} 預收學費負債餘額與待履約堂數`,
    ]

    if (domain === 'out_of_scope') {
      text =
        `您好！目前系統 AI 助理僅開放【會計與財務管理】領域諮詢（例如：流水收支、損益總覽、預收銷課勾稽、合約收款與分期狀況等）。\n\n您所詢問的「學員個人資料/教練排課/場館營運」等模組預計將於後續版本陸續開放，敬請期待！`
    } else {
      text =
        `您好！我是 【${centerName}】 會計 AI 助理，專門為您提供場館財務與會計相關的數據查詢與分析。\n\n您可以向我詢問收入、支出、損益、預收款項與合約金流等問題。`
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

    // Heuristic fallback: Check keywords or if conversation already underway
    const keywords = ['收', '支', '帳', '錢', '損益', '營收', '費用', '預收', '銷課', '合約', '款', '發票', '成本', '利潤', '去年', '上月']
    const isLikelyAccounting = keywords.some((k) => userMessage.includes(k)) || conversationHistory.length > 0

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
        text: `您好！我是 【${centerName}】 會計 AI 助理。目前專門協助您查詢與分析場館財務、流水收支、損益及合約款項。請問有什麼會計問題需要為您解答嗎？`,
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
        suggestedQuestions: [`查詢 ${centerName} 本月課程收入明細`, `查看 ${centerName} 今年度累積損益狀況`],
        metadata: {
          centerId,
          executedTools: [],
          timestamp,
        },
      },
    }
  }
}

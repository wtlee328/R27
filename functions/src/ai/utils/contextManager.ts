import OpenAI from 'openai'
import { ChatMessage, MemoryCompactionInfo } from '../types'

/**
 * Official GPT-6 Luna Model Specifications:
 * - Context Window: 1,050,000 tokens
 * - Max Output Limit: 128,000 tokens
 * - Compaction Threshold: 60% of context window (630,000 tokens)
 */
export const CONTEXT_WINDOW_LIMIT = process.env.AI_CONTEXT_WINDOW_LIMIT
  ? parseInt(process.env.AI_CONTEXT_WINDOW_LIMIT, 10)
  : 1050000

export const MAX_OUTPUT_LIMIT = 128000
export const COMPACTION_THRESHOLD_RATIO = 0.60
export const COMPACTION_TRIGGER_TOKENS = Math.floor(CONTEXT_WINDOW_LIMIT * COMPACTION_THRESHOLD_RATIO) // 630,000 by default

// Approximate overheads for System Prompt instructions & Tools JSON Schema
const SYSTEM_PROMPT_BASE_TOKENS = 950
const TOOLS_SCHEMA_BASE_TOKENS = 1250
const MESSAGE_FRAME_OVERHEAD = 4

/**
 * Robust and fast token estimator for mixed Traditional Chinese and English text.
 * - CJK characters (Traditional Chinese, full-width punctuation): ~1.8 tokens per character.
 * - Non-CJK (English, digits, spaces, half-width symbols): ~0.35 tokens per character (~1 token per 3 chars).
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0

  let cjkCount = 0
  let nonCjkCount = 0

  // Regex matching CJK Unified Ideographs, Extensions, and full-width punctuation
  const cjkRegex = /[\u4e00-\u9fa5\u3000-\u303f\uff01-\uff60\uffe0-\uffee]/

  for (let i = 0; i < text.length; i++) {
    if (cjkRegex.test(text[i])) {
      cjkCount++
    } else {
      nonCjkCount++
    }
  }

  const estimated = Math.ceil(cjkCount * 1.8 + nonCjkCount * 0.35)
  return Math.max(1, estimated)
}

/**
 * Calculates total tokens across the entire prompt context:
 * Instructions + Tools + All History Messages + Current User Message
 */
export function calculateTotalContextTokens(
  history: ChatMessage[],
  currentMessage: string,
  instructionsText?: string
): number {
  const instructionsTokens = instructionsText
    ? estimateTokenCount(instructionsText)
    : SYSTEM_PROMPT_BASE_TOKENS

  let historyTokens = 0
  for (const msg of history) {
    historyTokens += estimateTokenCount(msg.content) + MESSAGE_FRAME_OVERHEAD
  }

  const currentMsgTokens = estimateTokenCount(currentMessage) + MESSAGE_FRAME_OVERHEAD

  return instructionsTokens + TOOLS_SCHEMA_BASE_TOKENS + historyTokens + currentMsgTokens
}

/**
 * Manages Conversation Context Memory and performs automatic Compaction
 * when total context tokens reach >= 60% of the context window.
 */
export async function manageContextMemory(
  openai: OpenAI,
  centerId: string,
  history: ChatMessage[],
  currentMessage: string,
  instructionsText?: string
): Promise<{
  managedHistory: ChatMessage[]
  compactionInfo: MemoryCompactionInfo
}> {
  const totalTokensBefore = calculateTotalContextTokens(history, currentMessage, instructionsText)
  const usageRatio = totalTokensBefore / CONTEXT_WINDOW_LIMIT
  const usagePercent = Math.round(usageRatio * 100)

  // Condition check: Needs to exceed 60% threshold AND have at least 4 previous messages to compact
  const shouldCompact = totalTokensBefore >= COMPACTION_TRIGGER_TOKENS && history.length >= 4

  if (!shouldCompact) {
    return {
      managedHistory: history,
      compactionInfo: {
        compacted: false,
        totalTokensBefore,
        totalTokensAfter: totalTokensBefore,
        contextLimit: CONTEXT_WINDOW_LIMIT,
        usagePercent,
      },
    }
  }

  console.log(
    `[Context Manager] 🚨 Context reached ${usagePercent}% (${totalTokensBefore}/${CONTEXT_WINDOW_LIMIT} tokens). Triggering Memory Compaction for center "${centerId}"...`
  )

  // Strategy: Retain recent 4 messages intact (2 complete turns for immediate continuity),
  // and compress all preceding older messages into an explicit, fact-dense summary.
  const RECENT_MESSAGES_TO_KEEP = 4
  const olderMessages = history.slice(0, history.length - RECENT_MESSAGES_TO_KEEP)
  const recentMessages = history.slice(history.length - RECENT_MESSAGES_TO_KEEP)

  // Format older messages text for summarization
  const conversationToSummarize = olderMessages
    .map((m) => {
      const roleName = m.role === 'user' ? '管理員' : m.role === 'assistant' ? '會計助理' : '系統記憶'
      return `【${roleName}】：${m.content}`
    })
    .join('\n\n')

  const centerName = centerId === 'coffit' ? 'COFFIT' : 'R27'

  const compactionPrompt = `你是一個專業健身場館管理系統的「會計對話記憶壓縮專家」。
【當前服務場館】：${centerName}
請將以下較早的會計歷史對話紀錄，精煉壓縮為一份結構化、事實密集的「會計歷史對話記憶摘要（Memory Compaction）」。

【重要壓縮指引】：
1. 嚴格保留所有具體事實：
   - 討論過或查詢過的場館名稱、年份、月份、日期區間（例如：2026年9月、最近三個月）。
   - 提及的所有學員姓名（例如汪雪貞等）、合約編號、特定收支科目名稱（如課程收入、場租收入、房租、水電費等）。
   - 所有已查詢得出的財務結論數據、總額、淨額、筆數、預收學費餘額、未付分期金額等具體數字。
   - 管理員曾表達的偏好、查詢要求或特別指示。
2. 剔除無實質資訊的寒暄、禮貌性過場詞句。
3. 輸出格式請直接使用繁體中文條列陳述，開頭標明「【會計對話歷史記憶摘要】」，條理清晰，供後續對話無縫延續。`

  try {
    const summaryCompletion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: compactionPrompt },
        { role: 'user', content: conversationToSummarize },
      ],
      temperature: 0.1,
      max_tokens: 1000,
    })

    const summaryText =
      summaryCompletion.choices[0]?.message?.content?.trim() ||
      '【會計對話歷史記憶摘要】：已保留前期收支查詢與會計數據討論事實。'

    // Form new compacted history
    const summaryMessage: ChatMessage = {
      role: 'system',
      content: summaryText,
    }

    const managedHistory: ChatMessage[] = [summaryMessage, ...recentMessages]
    const totalTokensAfter = calculateTotalContextTokens(managedHistory, currentMessage, instructionsText)

    console.log(
      `[Context Manager] ✅ Compaction successful! Tokens reduced from ${totalTokensBefore} to ${totalTokensAfter} (Saved ${totalTokensBefore - totalTokensAfter} tokens).`
    )

    return {
      managedHistory,
      compactionInfo: {
        compacted: true,
        summary: summaryText,
        compactedMessageCount: olderMessages.length,
        totalTokensBefore,
        totalTokensAfter,
        contextLimit: CONTEXT_WINDOW_LIMIT,
        usagePercent: Math.round((totalTokensAfter / CONTEXT_WINDOW_LIMIT) * 100),
      },
    }
  } catch (compactionErr: any) {
    console.error('[Context Manager] Compaction API call failed, falling back to windowing:', compactionErr)

    // Fallback: If compaction API fails, safely keep the most recent messages to protect context
    const fallbackHistory = history.slice(-8)
    const totalTokensAfter = calculateTotalContextTokens(fallbackHistory, currentMessage, instructionsText)

    return {
      managedHistory: fallbackHistory,
      compactionInfo: {
        compacted: false,
        totalTokensBefore,
        totalTokensAfter,
        contextLimit: CONTEXT_WINDOW_LIMIT,
        usagePercent: Math.round((totalTokensAfter / CONTEXT_WINDOW_LIMIT) * 100),
      },
    }
  }
}

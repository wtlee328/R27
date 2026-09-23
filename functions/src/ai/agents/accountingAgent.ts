import OpenAI from 'openai'
import { AIAssistantResponse, StructuredAIBlock, ChatMessage, TableComponentData, StatCardData } from '../types'
import {
  queryCashFlowRecords,
  getProfitLossSummary,
  getPrepaidAndRealizedMetrics,
  queryContractPayments,
} from '../tools/accountingTools'
import { getTaipeiDateTimeInfo } from '../utils/timeUtils'

const AGENT_MODEL = 'gpt-6-luna'

export type ReasoningEffortLevel = 'low' | 'medium' | 'high'

/**
 * Dynamically determines reasoning.effort based on task complexity:
 * - high: Cross-period financial comparisons, profit & loss analysis, prepaid unearned revenue vs realized revenue reconciliation, contract installment/overdue audits, trend evaluation.
 * - medium: Multi-month / relative period queries (e.g. 最近三個月、最近半年、上個月、全年度明細), category cash flow aggregations.
 * - low: Single date / today's cash flow lookup, basic contract lookup, simple greeting / direct query.
 */
export function determineReasoningEffort(userMessage: string): ReasoningEffortLevel {
  const highComplexityKeywords = [
    '損益', '利潤', '毛利', '淨利', '預收', '銷課', '負債', '未實現', '履約',
    '比較', '趨勢', '分析', '異常', '逾期', '分期', '跨月', '半年', '年度', '全年度', '退費', '對帳'
  ]
  const mediumComplexityKeywords = [
    '最近三個月', '最近3個月', '上個月', '支出', '收入', '明細', '流水帳', '統計', '彙總', '總額'
  ]

  if (highComplexityKeywords.some((kw) => userMessage.includes(kw))) {
    return 'high'
  }
  if (mediumComplexityKeywords.some((kw) => userMessage.includes(kw))) {
    return 'medium'
  }
  return 'low'
}

// OpenAI Responses API Function Tool Definitions for gpt-6-luna
const accountingResponsesTools: OpenAI.Responses.FunctionTool[] = [
  {
    type: 'function',
    name: 'query_cash_flow_records',
    description:
      '查詢場館現金流水帳紀錄（收支明細、金額、類別、帳戶、備註等）。可指定特定日期範圍 (startDate/endDate)、或年度與月份、收支類型、關鍵字。若查詢「最近三個月」、「最近半年」等相對區間，請計算出精確的 startDate 與 endDate (格式 YYYY-MM-DD) 傳入。',
    strict: null,
    parameters: {
      type: 'object',
      properties: {
        startDate: {
          type: 'string',
          description: '查詢起始日期，格式 YYYY-MM-DD（例如最近三個月起始日 2026-07-01）',
        },
        endDate: {
          type: 'string',
          description: '查詢結束日期，格式 YYYY-MM-DD（例如今天日期）',
        },
        year: { type: 'number', description: '查詢年份，例如 2026（若有填 startDate/endDate 則此欄可不填）' },
        month: { type: 'number', description: '查詢月份 (1-12)。若不填或填 0 則代表全年度' },
        type: {
          type: 'string',
          enum: ['income', 'expense', 'all'],
          description: '收支類型：income (收入), expense (支出), all (全部)',
        },
        category: { type: 'string', description: '收支類別過濾（例如：課程收入、場租收入、房租、水電費、薪酬）' },
        searchTerm: { type: 'string', description: '關鍵字搜尋（學員姓名、備註或摘要內容）' },
        limit: { type: 'number', description: '最多回傳筆數，預設 50' },
      },
    },
  },
  {
    type: 'function',
    name: 'get_profit_loss_summary',
    description:
      '獲取特定日期區間或年份月份的損益彙總（營業收入總額、營業支出總額、淨損益，以及各收支大類金額與佔比）。若查詢「最近三個月」、「最近半年」等區間，請直接使用 startDate 與 endDate (格式 YYYY-MM-DD)。',
    strict: null,
    parameters: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: '查詢起始日期，格式 YYYY-MM-DD' },
        endDate: { type: 'string', description: '查詢結束日期，格式 YYYY-MM-DD' },
        year: { type: 'number', description: '查詢年份，例如 2026' },
        month: { type: 'number', description: '查詢月份 (1-12)。若不填則代表全年度' },
      },
    },
  },
  {
    type: 'function',
    name: 'get_prepaid_and_realized_metrics',
    description:
      '獲取特定日期區間或年份月份的預收學費與銷課實現營收指標（合約總簽約額、全期實收款、躉繳/分期實收、銷課實現營收、預收學費負債餘額、有效合約總堂數與剩餘堂數）。若查詢特定區間請傳入 startDate 與 endDate。',
    strict: null,
    parameters: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: '查詢起始日期，格式 YYYY-MM-DD' },
        endDate: { type: 'string', description: '查詢結束日期，格式 YYYY-MM-DD' },
        year: { type: 'number', description: '查詢年份，例如 2026' },
        month: { type: 'number', description: '查詢月份 (1-12)。若不填則代表全年度' },
      },
    },
  },
  {
    type: 'function',
    name: 'query_contract_payments',
    description:
      '查詢學員課程合約款項與分期收款狀態（學員姓名、合約編號、合約總額、已付金額、未付餘額、分期付款狀態等）。',
    strict: null,
    parameters: {
      type: 'object',
      properties: {
        studentName: { type: 'string', description: '學員姓名關鍵字（可選）' },
        paymentStatus: {
          type: 'string',
          enum: ['paid', 'pending', 'overdue', 'all'],
          description: '付款狀態：paid (已結清), pending (分期中未結清), overdue (有逾期款), all (全部)',
        },
        limit: { type: 'number', description: '最多回傳筆數，預設 30' },
      },
    },
  },
]

function getSystemPrompt(centerId: string) {
  const centerName = centerId === 'coffit' ? 'COFFIT' : 'R27'
  const timeInfo = getTaipeiDateTimeInfo()

  return `你是一個專業且嚴謹的健身場館「會計 AI 助理」。
【目前服務場館】：${centerName}（centerId: "${centerId}"）。
【現在時間（台灣時區 Asia/Taipei，UTC+8）】：${timeInfo.fullString}
- 當前年份：${timeInfo.year} 年
- 當前月份：${timeInfo.month} 月
- 當前今天日期：${timeInfo.dateStr} (${timeInfo.weekday})

【時間基準與相對時間計算指引】：
1. 以上提供的台灣現在時間為所有時間判斷的「唯一絕對基準」，請勿依賴自身預設日期。
2. 當使用者提及相對時間時，請以此基準精確計算起迄日期：
   - 「今天」：${timeInfo.dateStr}
   - 「本月 / 這個月」：${timeInfo.year} 年 ${timeInfo.month} 月（區間：${timeInfo.currentMonthStartDate} 至 ${timeInfo.dateStr}）
   - 「上個月」：${timeInfo.lastMonthYear} 年 ${timeInfo.lastMonth} 月
   - 「今年」：${timeInfo.year} 年（${timeInfo.year}-01-01 至 ${timeInfo.dateStr}）
   - 「去年」：${timeInfo.year - 1} 年（${timeInfo.year - 1}-01-01 至 ${timeInfo.year - 1}-12-31）
   - 「最近三個月」：以現在為基準往前回推三個月（區間：${timeInfo.threeMonthsAgoStartDate} 至 ${timeInfo.dateStr}）
   - 「最近半年」：以現在為基準往前回推六個月（區間：${timeInfo.sixMonthsAgoStartDate} 至 ${timeInfo.dateStr}）
3. 在調用資料庫查詢工具（Tools）時，若涉及日期區間（例如「最近三個月」、「最近半年」或指定起迄日），請務必使用 startDate 與 endDate 參數（格式 YYYY-MM-DD）進行查詢，確保 DB 查詢範圍與你的時間推算完全一致！

【最高原則】：
1. 嚴格場館隔離：你目前【僅】負責【${centerName}】場館的數據。任何查詢、分析或延伸問題的解答，均必須 100% 針對【${centerName}】，切勿引用或混淆其他場館的資料。
2. 零數據幻覺（Zero Data Hallucination Policy）：你的所有金額、筆數、姓名與堂數數據必須 100% 來自 Tool 調用的回傳結果，嚴禁自創捏造任何數字。
3. 若查詢結果為空或無相關資料，請如實告知「在指定的日期範圍（XXXX-XX-XX 至 XXXX-XX-XX）查無相關資料」，並提醒使用者核對條件或確認是否已切換至正確場館。
4. 回答風格應專業、清晰，先以簡要總結重點數值，並對重大數據做清楚的條列說明。
5. 在回答結尾，請主動提供 2~3 個管理員可能感興趣的後續財務延伸問題。`
}

/**
 * Executes specialized Accounting Agent with gpt-6-luna and dynamic reasoning.effort
 */
export async function executeAccountingAgent(
  openai: OpenAI,
  userMessage: string,
  centerId: string,
  history: ChatMessage[] = []
): Promise<AIAssistantResponse> {
  const timestamp = Date.now()
  const messageId = `msg_${timestamp}`
  const conversationId = `conv_${timestamp}`
  const executedTools: string[] = []
  const toolResultsList: any[] = []

  // Dynamic reasoning effort evaluation based on task difficulty
  const reasoningEffort = determineReasoningEffort(userMessage)

  // Build input message sequence
  const inputItems: any[] = []
  if (history && history.length > 0) {
    const recentHistory = history.slice(-6)
    for (const h of recentHistory) {
      if (h.role === 'user' || h.role === 'assistant') {
        inputItems.push({ role: h.role, content: h.content })
      }
    }
  }
  inputItems.push({ role: 'user', content: userMessage })

  try {
    // 1. Initial Call to Responses API with gpt-6-luna and dynamic reasoning.effort
    let currentResponse = await openai.responses.create({
      model: AGENT_MODEL,
      instructions: getSystemPrompt(centerId),
      input: inputItems,
      tools: accountingResponsesTools,
      reasoning: { effort: reasoningEffort },
    })

    // 2. Handle Tool Calls Loop (up to 3 turns)
    let loopCount = 0
    let toolCalls = (currentResponse.output || []).filter((item: any) => item.type === 'function_call')

    while (toolCalls.length > 0 && loopCount < 3) {
      loopCount++
      const functionOutputs: any[] = []

      for (const tc of toolCalls as any[]) {
        if (tc.type !== 'function_call') continue
        const fnName = tc.name
        let fnArgs: any = {}
        try {
          fnArgs = JSON.parse(tc.arguments || '{}')
        } catch (e) {
          console.warn('Failed to parse tool call args:', tc.arguments)
        }

        // Force centerId into tool args
        fnArgs.centerId = centerId
        executedTools.push(fnName)

        let result: any = null
        try {
          if (fnName === 'query_cash_flow_records') {
            result = await queryCashFlowRecords(fnArgs)
          } else if (fnName === 'get_profit_loss_summary') {
            result = await getProfitLossSummary(fnArgs)
          } else if (fnName === 'get_prepaid_and_realized_metrics') {
            result = await getPrepaidAndRealizedMetrics(fnArgs)
          } else if (fnName === 'query_contract_payments') {
            result = await queryContractPayments(fnArgs)
          } else {
            result = { error: `未知的工具函式：${fnName}` }
          }
        } catch (toolErr: any) {
          console.error(`Error executing ${fnName}:`, toolErr)
          result = { error: `查詢失敗：${toolErr?.message || '資料庫讀取異常'}` }
        }

        toolResultsList.push({ tool: fnName, data: result })

        functionOutputs.push({
          type: 'function_call_output',
          call_id: tc.call_id,
          output: JSON.stringify(result),
        })
      }

      // Next turn: feed function outputs back into Responses API
      currentResponse = await openai.responses.create({
        model: AGENT_MODEL,
        previous_response_id: currentResponse.id,
        input: functionOutputs,
        reasoning: { effort: reasoningEffort },
      })

      toolCalls = (currentResponse.output || []).filter((item: any) => item.type === 'function_call')
    }

    const replyText = currentResponse.output_text || '已完成財務數據查詢。'

    // 3. Transform Tool Results into Structured UI Blocks
    const blocks: StructuredAIBlock[] = []

    for (const item of toolResultsList) {
      const { tool, data } = item
      if (!data || data.error) continue

      const periodLabel =
        data.dateRangeLabel ||
        (data.year
          ? data.month === 'all'
            ? `${data.year}全年度`
            : `${data.year}年${data.month}月`
          : '')

      if (tool === 'query_cash_flow_records') {
        // Stat cards
        const statCards: StatCardData[] = [
          {
            title: `${periodLabel ? `${periodLabel} ` : ''}總收入`,
            value: `NT$ ${data.totalIncome.toLocaleString()}`,
            color: 'emerald',
          },
          {
            title: `${periodLabel ? `${periodLabel} ` : ''}總支出`,
            value: `NT$ ${data.totalExpense.toLocaleString()}`,
            color: 'red',
          },
          {
            title: `${periodLabel ? `${periodLabel} ` : ''}淨現金流`,
            value: `NT$ ${data.netCashFlow.toLocaleString()}`,
            color: data.netCashFlow >= 0 ? 'emerald' : 'red',
          },
        ]
        blocks.push({ type: 'stat_card_group', data: statCards })

        // Data table
        if (data.records && data.records.length > 0) {
          const tableData: TableComponentData = {
            title: `${periodLabel ? `${periodLabel} ` : ''}收支明細列表 (共 ${data.totalRecordsFound} 筆)`,
            columns: [
              { key: 'date', label: '日期', type: 'date' },
              { key: 'type', label: '收支', type: 'badge' },
              { key: 'category', label: '類別', type: 'text' },
              { key: 'amount', label: '金額', type: 'currency', align: 'right' },
              { key: 'description', label: '摘要', type: 'text' },
              { key: 'notes', label: '備註', type: 'text' },
            ],
            rows: data.records,
            summaryRow: {
              date: '總計',
              type: '-',
              category: '-',
              amount: data.totalIncome - data.totalExpense,
              description: `收入 ${data.totalIncome.toLocaleString()} / 支出 ${data.totalExpense.toLocaleString()}`,
            },
            totalCount: data.totalRecordsFound,
          }
          blocks.push({ type: 'table', data: tableData })
        }
      } else if (tool === 'get_profit_loss_summary') {
        const statCards: StatCardData[] = [
          {
            title: `${periodLabel ? `${periodLabel} ` : ''}營業總收入`,
            value: `NT$ ${data.totalIncome.toLocaleString()}`,
            color: 'emerald',
          },
          {
            title: `${periodLabel ? `${periodLabel} ` : ''}營業總支出`,
            value: `NT$ ${data.totalExpense.toLocaleString()}`,
            color: 'red',
          },
          {
            title: `${periodLabel ? `${periodLabel} ` : ''}淨損益`,
            value: `NT$ ${data.netProfit.toLocaleString()}`,
            color: data.netProfit >= 0 ? 'emerald' : 'red',
          },
        ]
        blocks.push({ type: 'stat_card_group', data: statCards })

        // Income breakdown table
        if (data.topIncomeCategories && data.topIncomeCategories.length > 0) {
          const tableData: TableComponentData = {
            title: `${periodLabel ? `${periodLabel} ` : ''}收入類別結構分佈`,
            columns: [
              { key: 'category', label: '收入類別', type: 'text' },
              { key: 'amount', label: '金額 (NT$)', type: 'currency', align: 'right' },
              { key: 'percentage', label: '佔比', type: 'text', align: 'right' },
            ],
            rows: data.topIncomeCategories,
            totalCount: data.topIncomeCategories.length,
          }
          blocks.push({ type: 'table', data: tableData })
        }

        // Expense breakdown table
        if (data.topExpenseCategories && data.topExpenseCategories.length > 0) {
          const tableData: TableComponentData = {
            title: `${periodLabel ? `${periodLabel} ` : ''}支出類別結構分佈`,
            columns: [
              { key: 'category', label: '支出類別', type: 'text' },
              { key: 'amount', label: '金額 (NT$)', type: 'currency', align: 'right' },
              { key: 'percentage', label: '佔比', type: 'text', align: 'right' },
            ],
            rows: data.topExpenseCategories,
            totalCount: data.topExpenseCategories.length,
          }
          blocks.push({ type: 'table', data: tableData })
        }
      } else if (tool === 'get_prepaid_and_realized_metrics') {
        const statCards: StatCardData[] = [
          {
            title: `${periodLabel ? `${periodLabel} ` : ''}全期實收款總額`,
            value: `NT$ ${data.periodTotalPaidAmount.toLocaleString()}`,
            subtitle: `躉繳 ${data.lumpSumPaidAmount.toLocaleString()} / 分期已付 ${data.installmentPaidAmount.toLocaleString()}`,
            color: 'emerald',
          },
          {
            title: `${periodLabel ? `${periodLabel} ` : ''}銷課實現營收`,
            value: `NT$ ${data.realizedLessonRevenue.toLocaleString()}`,
            subtitle: `共完成 ${data.realizedLessonCount} 堂課`,
            color: 'purple',
          },
          {
            title: '預收學費負債估算',
            value: `NT$ ${data.unearnedRevenueEstimate.toLocaleString()}`,
            subtitle: `有效合約待履約堂數：${data.activeContractsRemainingSessions} 堂`,
            color: 'amber',
          },
        ]
        blocks.push({ type: 'stat_card_group', data: statCards })
      } else if (tool === 'query_contract_payments') {
        if (data.contracts && data.contracts.length > 0) {
          const tableData: TableComponentData = {
            title: `合約款項明細表 (共 ${data.totalFound} 筆)`,
            columns: [
              { key: 'contractNo', label: '合約編號', type: 'text' },
              { key: 'studentName', label: '學員姓名', type: 'text' },
              { key: 'totalAmount', label: '合約總額', type: 'currency', align: 'right' },
              { key: 'paidAmount', label: '已付金額', type: 'currency', align: 'right' },
              { key: 'unpaidAmount', label: '未付餘額', type: 'currency', align: 'right' },
              { key: 'paymentType', label: '繳款方式', type: 'badge' },
              { key: 'paymentStatus', label: '狀態', type: 'badge' },
            ],
            rows: data.contracts,
            totalCount: data.totalFound,
          }
          blocks.push({ type: 'table', data: tableData })
        }
      }
    }

    // Suggested questions with center name
    const centerName = centerId === 'coffit' ? 'COFFIT' : 'R27'
    const suggestedQuestions = [
      `查詢 ${centerName} 本月課程收入明細`,
      `查詢 ${centerName} 最近三個月的支出分析`,
      `查看 ${centerName} 今年度損益佔比`,
      `目前 ${centerName} 預收學費負債餘額還有多少？`,
    ]

    return {
      conversationId,
      messageId,
      domain: 'accounting',
      text: replyText,
      blocks,
      suggestedQuestions,
      metadata: {
        centerId,
        executedTools,
        timestamp,
        model: AGENT_MODEL,
        reasoningEffort,
      },
    }
  } catch (error: any) {
    console.error('[Accounting Agent] Execution error:', error)
    return {
      conversationId,
      messageId,
      domain: 'accounting',
      text: `查詢處理時發生異常：${error?.message || 'OpenAI API 響應錯誤'}。請檢查 API Key 配額或稍候再試。`,
      blocks: [
        {
          type: 'alert_box',
          data: {
            title: '查詢失敗',
            message: error?.message || '連線逾時或 API Key 配置錯誤',
            type: 'warning',
          },
        },
      ],
      suggestedQuestions: ['重新查詢本月收入', '查看損益概況'],
      metadata: {
        centerId,
        executedTools,
        timestamp,
        model: AGENT_MODEL,
        reasoningEffort,
      },
    }
  }
}

import OpenAI from 'openai'
import { AIAssistantResponse, StructuredAIBlock, ChatMessage, TableComponentData, StatCardData } from '../types'
import {
  queryCashFlowRecords,
  getProfitLossSummary,
  getPrepaidAndRealizedMetrics,
  queryContractPayments,
} from '../tools/accountingTools'

const AGENT_MODEL = 'gpt-5.6-luna'

// OpenAI Function Calling Tool Definitions
const accountingToolsDeclarations: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'query_cash_flow_records',
      description: '查詢場館現金流水帳紀錄（收支明細、金額、類別、帳戶、備註等）。可指定年度、月份、收支類型或關鍵字。',
      parameters: {
        type: 'object',
        properties: {
          year: { type: 'number', description: '查詢年份，例如 2026' },
          month: { type: 'number', description: '查詢月份 (1-12)。若不填或填 0 則代表全年度' },
          type: { type: 'string', enum: ['income', 'expense', 'all'], description: '收支類型：income (收入), expense (支出), all (全部)' },
          category: { type: 'string', description: '收支類別過濾（例如：課程收入、場租收入、房租、水電費、薪酬）' },
          searchTerm: { type: 'string', description: '關鍵字搜尋（學員姓名、備註或摘要內容）' },
          limit: { type: 'number', description: '最多回傳筆數，預設 50' },
        },
        required: ['year'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_profit_loss_summary',
      description: '獲取特定年份或月份的損益彙總（營業收入總額、營業支出總額、淨損益，以及各收支大類金額與佔比）。',
      parameters: {
        type: 'object',
        properties: {
          year: { type: 'number', description: '查詢年份，例如 2026' },
          month: { type: 'number', description: '查詢月份 (1-12)。若不填則代表全年度' },
        },
        required: ['year'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_prepaid_and_realized_metrics',
      description: '獲取預收學費與銷課實現營收指標（合約總簽約額、全期實收款、躉繳/分期實收、銷課實現營收、預收學費負債餘額、有效合約總堂數與剩餘堂數）。',
      parameters: {
        type: 'object',
        properties: {
          year: { type: 'number', description: '查詢年份，例如 2026' },
          month: { type: 'number', description: '查詢月份 (1-12)。若不填則代表全年度' },
        },
        required: ['year'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_contract_payments',
      description: '查詢學員課程合約款項與分期收款狀態（學員姓名、合約編號、合約總額、已付金額、未付餘額、分期付款狀態等）。',
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
  },
]

const SYSTEM_PROMPT = `你是一個專業且嚴謹的健身場館「會計 AI 助理」。
你的任務是協助管理員快速查詢與分析財務資料（流水帳、損益、預收銷課、合約收款等）。

【最高原則】：
1. 你的所有金額、筆數、姓名與堂數數據必須 100% 來自 Tool 調用的回傳結果，嚴禁自創捏造任何數字（Zero Hallucination Policy）。
2. 若查詢結果為空或無相關資料，請如實告知「在指定的年份/月份條件下查無相關資料」，並提醒使用者核對條件或分店切換。
3. 若使用者的問題沒有提及年份，預設請使用當前年份（2026 年）或當月進行查詢。
4. 回答風格應專業、清晰，先以簡要總結重點數值，並對重大數據做清楚的條列說明。
5. 在回答結尾，請主動提供 2~3 個管理員可能感興趣的後續財務延伸問題。`

/**
 * Executes specialized Accounting Agent with gpt-5.6-luna
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

  // Build message sequence
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
  ]

  // Add conversation history (up to last 6 turns)
  if (history && history.length > 0) {
    const recentHistory = history.slice(-6)
    for (const h of recentHistory) {
      if (h.role === 'user' || h.role === 'assistant') {
        messages.push({ role: h.role, content: h.content })
      }
    }
  }

  messages.push({ role: 'user', content: userMessage })

  try {
    // 1. First Model Call (May decide to call tools)
    let response = await openai.chat.completions.create({
      model: AGENT_MODEL,
      messages,
      tools: accountingToolsDeclarations,
      tool_choice: 'auto',
      reasoning_effort: 'none',
      temperature: 0.2,
    })

    let choice = response.choices[0]
    let currentMessage = choice?.message

    // 2. Handle Tool Calls Loop (up to 3 turns)
    let loopCount = 0
    while (currentMessage?.tool_calls && currentMessage.tool_calls.length > 0 && loopCount < 3) {
      loopCount++
      messages.push(currentMessage)

      for (const toolCall of currentMessage.tool_calls) {
        if (toolCall.type !== 'function') continue
        const fnName = toolCall.function.name
        let fnArgs: any = {}
        try {
          fnArgs = JSON.parse(toolCall.function.arguments || '{}')
        } catch (e) {
          console.warn('Failed to parse tool call args:', toolCall.function.arguments)
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

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        })
      }

      // Call model again with tool results
      response = await openai.chat.completions.create({
        model: AGENT_MODEL,
        messages,
        reasoning_effort: 'none',
        temperature: 0.2,
      })

      choice = response.choices[0]
      currentMessage = choice?.message
    }

    const replyText = currentMessage?.content || '已完成財務數據查詢。'

    // 3. Transform Tool Results into Structured UI Blocks
    const blocks: StructuredAIBlock[] = []

    for (const item of toolResultsList) {
      const { tool, data } = item
      if (!data || data.error) continue

      if (tool === 'query_cash_flow_records') {
        // Stat cards
        const statCards: StatCardData[] = [
          {
            title: `${data.month === 'all' ? `${data.year}年` : `${data.year}年${data.month}月`} 總收入`,
            value: `NT$ ${data.totalIncome.toLocaleString()}`,
            color: 'emerald',
          },
          {
            title: '總支出',
            value: `NT$ ${data.totalExpense.toLocaleString()}`,
            color: 'red',
          },
          {
            title: '淨現金流',
            value: `NT$ ${data.netCashFlow.toLocaleString()}`,
            color: data.netCashFlow >= 0 ? 'emerald' : 'red',
          },
        ]
        blocks.push({ type: 'stat_card_group', data: statCards })

        // Data table
        if (data.records && data.records.length > 0) {
          const tableData: TableComponentData = {
            title: `${data.month === 'all' ? `${data.year}年` : `${data.year}年${data.month}月`} 收支明細列表 (共 ${data.totalRecordsFound} 筆)`,
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
            title: '營業總收入',
            value: `NT$ ${data.totalIncome.toLocaleString()}`,
            color: 'emerald',
          },
          {
            title: '營業總支出',
            value: `NT$ ${data.totalExpense.toLocaleString()}`,
            color: 'red',
          },
          {
            title: '本期淨損益',
            value: `NT$ ${data.netProfit.toLocaleString()}`,
            color: data.netProfit >= 0 ? 'emerald' : 'red',
          },
        ]
        blocks.push({ type: 'stat_card_group', data: statCards })

        // Income breakdown table
        if (data.topIncomeCategories && data.topIncomeCategories.length > 0) {
          const tableData: TableComponentData = {
            title: '收入類別結構分佈',
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
            title: '支出類別結構分佈',
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
            title: '全期實收款總額',
            value: `NT$ ${data.periodTotalPaidAmount.toLocaleString()}`,
            subtitle: `躉繳 ${data.lumpSumPaidAmount.toLocaleString()} / 分期已付 ${data.installmentPaidAmount.toLocaleString()}`,
            color: 'emerald',
          },
          {
            title: '銷課實現營收',
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

    // Suggested questions
    const suggestedQuestions = [
      '查詢本月課程收入明細',
      '損益表的收支結構佔比',
      '目前預收學費負債餘額還有多少？',
      '有未結清或分期逾期的合約嗎？',
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
      },
    }
  }
}

import OpenAI from 'openai'
import { AIAssistantResponse, StructuredAIBlock, ChatMessage, TableComponentData, StatCardData } from '../types'
import {
  queryCashFlowRecords,
  getProfitLossSummary,
  getPrepaidAndRealizedMetrics,
  queryContractPayments,
  getFinancialMetrics,
  reconcileMetrics,
  drilldownMetric,
} from '../tools/accountingTools'
import { generateRegistryPromptSnippet } from '../../finance-core'
import { getTaipeiDateTimeInfo } from '../utils/timeUtils'
import { manageContextMemory } from '../utils/contextManager'

const AGENT_MODEL = 'gpt-6-luna'

export type ReasoningEffortLevel = 'low' | 'medium' | 'high'

/**
 * Dynamically determines reasoning.effort based on task complexity:
 * - high: Cross-period financial comparisons, profit & loss analysis, prepaid unearned revenue vs realized revenue reconciliation, contract installment/overdue audits, trend evaluation.
 * - medium: Multi-month / relative period queries (e.g. 最近三個月、最近半年、上個月、全年度明細), category cash flow aggregations.
 * - low: Single date / today's cash flow lookup, basic contract lookup, simple greeting / direct query.
 */
export function determineReasoningEffort(userMessage: string, history: ChatMessage[] = []): ReasoningEffortLevel {
  const highComplexityKeywords = [
    '損益', '利潤', '毛利', '淨利', '預收', '銷課', '負債', '未實現', '履約',
    '比較', '趨勢', '分析', '異常', '逾期', '分期', '跨月', '半年', '年度', '全年度', '退費', '對帳', '勾稽', '對不上', '差額'
  ]
  const mediumComplexityKeywords = [
    '最近三個月', '最近3個月', '上個月', '支出', '收入', '明細', '流水帳', '統計', '彙總', '總額', '去年'
  ]

  // Inspect combined text across recent turns and current prompt to preserve reasoning level during follow-ups
  const combinedText = [
    ...history.slice(-2).map((m) => m.content || ''),
    userMessage,
  ].join(' ')

  if (highComplexityKeywords.some((kw) => combinedText.includes(kw))) {
    return 'high'
  }
  if (mediumComplexityKeywords.some((kw) => combinedText.includes(kw))) {
    return 'medium'
  }
  return 'low'
}

// OpenAI Responses API Function Tool Definitions for gpt-6-luna
const accountingResponsesTools: OpenAI.Responses.FunctionTool[] = [
  {
    type: 'function',
    name: 'get_financial_metrics',
    description:
      '【核心推薦工具】獲取場館標準規範之財務與會計指標（包含合約總簽約額、全期合約實收款、銷課實現營收、預收學費負債餘額、權責制營業損益、收付實現現金流淨額等）。支援指定特定起訖日 (startDate/endDate) 或年份與月份。',
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
    name: 'reconcile_financial_metrics',
    description:
      '【勾稽對帳工具】當兩個指標或前端報表數字對不上、有差額或需要查核原因時使用。支援三種勾稽比對：1. contracts_total_vs_paid (合約總額 vs 實收款，查核分期未繳) 2. collected_vs_realized (實收款 vs 銷課實現，查核預收學費負債) 3. cashflow_tuition_vs_contracts (現金流水帳學費 vs 合約模組實收款，查核跨期入帳)。',
    strict: null,
    parameters: {
      type: 'object',
      properties: {
        reconcileType: {
          type: 'string',
          enum: ['contracts_total_vs_paid', 'collected_vs_realized', 'cashflow_tuition_vs_contracts'],
          description: '勾稽類型：contracts_total_vs_paid, collected_vs_realized, cashflow_tuition_vs_contracts',
        },
        startDate: { type: 'string', description: '查詢起始日期，格式 YYYY-MM-DD' },
        endDate: { type: 'string', description: '查詢結束日期，格式 YYYY-MM-DD' },
        year: { type: 'number', description: '查詢年份，例如 2026' },
        month: { type: 'number', description: '查詢月份 (1-12)。若不填則代表全年度' },
      },
      required: ['reconcileType'],
    },
  },
  {
    type: 'function',
    name: 'drilldown_financial_metric',
    description:
      '【指標下鑽穿透】下鑽查詢特定指標的底層組成明細與計算公式。例如下鑽 cashFlowTotalIncome (現金流總收入明細) 或 contractedAmount (合約清單)。',
    strict: null,
    parameters: {
      type: 'object',
      properties: {
        metricId: {
          type: 'string',
          description: '指標 ID，例如 contractedAmount, totalCollectedAmount, realizedLessonRevenue, unearnedRevenueLiabilityBalance, cashFlowTotalIncome 等',
        },
        startDate: { type: 'string', description: '查詢起始日期，格式 YYYY-MM-DD' },
        endDate: { type: 'string', description: '查詢結束日期，格式 YYYY-MM-DD' },
        year: { type: 'number', description: '查詢年份，例如 2026' },
        month: { type: 'number', description: '查詢月份 (1-12)' },
        limit: { type: 'number', description: '最多回傳明細筆數，預設 50' },
      },
      required: ['metricId'],
    },
  },
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
  const registryPrompt = generateRegistryPromptSnippet()

  return `你是一個專業且嚴謹的健身場館「會計 AI 助理」。
【目前服務場館】：${centerName}（centerId: "${centerId}"）。
⚠️ 重要觀念提醒：「R27」與「COFFIT」為健身場館名稱，絕非「27堂課程」！使用者提問「R27 課程收入」係指該場館內的所有課程收入（包含 27 堂、36 堂、48 堂等所有合約方案規格）。只要工具回傳的紀錄，全都是屬於本場館的課程收入，請 100% 完整計算，絕對不要自作主張把 R27 當作堂數去過濾掉 48 堂或其他堂數！
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

${registryPrompt}

【專業勾稽與差額解釋指引（Reconciliation Guidelines）】：
1. 嚴禁任何數字幻覺：如果你回答的數字與使用者看到的報表不同，絕不可憑空猜測「可能有退款」或「系統未入帳」，請【立刻調用 reconcile_financial_metrics 工具】進行精準勾稽！
2. 合約實收與分期付款邏輯：
   - 部分合約採分期付款（paymentType === 'installment'），在會計帳上是以整份合約的總金額認列簽約額，但在實收款項中，只會計算「已繳期數（status === 'paid'）」的金額。尚未繳款的期數屬於待收分期帳款。
   - 一次付清（躉繳）合約簽署時，全額實收即等於合約總金額。
3. 預收學費與銷課實現差異與期間勾稽：
   - 「實收款項扣銷課金額」：
     * 若為「全期（歷史至今）」：代表場館成立至今累積的「預收學費負債餘額（待履約義務）」。
     * 若使用者指定特定月份或日期區間（例如「改查本月」或「2026年10月」）：系統會自動將實收款項鎖定在「該期間內新簽合約之實收款（例如 10 月新約實收）」，並將銷課金額鎖定在「該期間內實際消耗之銷課營收（例如 10 月銷課）」。
     * 工具 reconcile_financial_metrics 支援傳入 year/month 或 startDate/endDate。當使用者要求查詢某月份（如「改查本月」），請務必將該月份之 year 與 month (或起訖日) 傳入工具！工具已精準支援期間實收與期間銷課的勾稽比對，請直接信任並完整解讀工具回傳的 sideATotal、sideBTotal 與差額，切勿質疑工具回傳的期間數據！
4. 現金流流水帳與合約模組實收款差異：
   - 現金流紀錄代表銀行與現金帳戶之實際進出（收付實現制）。合約模組實收款代表該期間簽約所產生的已收金額。

【多輪對話承接與省略句解析指引】：
1. 當使用者發送省略句、切換時間或追問（例如「我要看去年」、「那8月呢」、「汪雪貞呢」、「算成含稅是多少」）：
   - 請務必結合前次回話的主題、類別與指標進行理解。
   - 例如：前一輪剛查詢「今年的損益狀況」，接著問「我要看去年」，即代表「查詢去年的累積損益狀況」，請直接調用相應工具（如 get_financial_metrics 或 get_profit_loss_summary，year: ${timeInfo.year - 1}），切勿反問使用者要看什麼！

【最高原則】：
1. 嚴格場館隔離：你目前【僅】負責【${centerName}】場館的數據。任何查詢、分析或延伸問題的解答，均必須 100% 針對【${centerName}】，切勿引用或混淆其他場館的資料。
2. 零數據幻覺（Zero Data Hallucination Policy）：你的所有金額、筆數、姓名與堂數數據必須 100% 來自 Tool 調用的回傳結果，嚴禁自創捏造任何數字。
3. 在回答結尾，請主動提供 2~3 個管理員可能感興趣的後續財務延伸問題。`
}

/**
 * Executes specialized Accounting Agent with gpt-6-luna and dynamic reasoning.effort
 */
export async function executeAccountingAgent(
  openai: OpenAI,
  userMessage: string,
  centerId: string,
  history: ChatMessage[] = [],
  contextMeta?: { userId?: string; sessionId?: string }
): Promise<AIAssistantResponse> {
  const timestamp = Date.now()
  const messageId = `msg_${timestamp}`
  const conversationId = contextMeta?.sessionId || `conv_${timestamp}`
  const executedTools: string[] = []
  const toolResultsList: any[] = []

  // Dynamic reasoning effort evaluation based on task difficulty (with history context)
  const reasoningEffort = determineReasoningEffort(userMessage, history)

  // Generate System Prompt
  const systemPrompt = getSystemPrompt(centerId)

  // Manage Context Memory & Automatic Compaction at 60% Context Window
  const { managedHistory, compactionInfo } = await manageContextMemory(
    openai,
    centerId,
    history,
    userMessage,
    systemPrompt
  )

  // Build input message sequence using full managed context (supports system memory summary, user, assistant)
  const inputItems: any[] = []
  for (const h of managedHistory) {
    if (h.role === 'user' || h.role === 'assistant' || h.role === 'system') {
      inputItems.push({ role: h.role, content: h.content })
    }
  }
  inputItems.push({ role: 'user', content: userMessage })

  try {
    // 1. Initial Call to Responses API with gpt-6-luna and dynamic reasoning.effort
    let currentResponse = await openai.responses.create({
      model: AGENT_MODEL,
      instructions: systemPrompt,
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
          if (fnName === 'get_financial_metrics') {
            result = await getFinancialMetrics(fnArgs)
          } else if (fnName === 'reconcile_financial_metrics') {
            result = await reconcileMetrics(fnArgs)
          } else if (fnName === 'drilldown_financial_metric') {
            result = await drilldownMetric(fnArgs)
          } else if (fnName === 'query_cash_flow_records') {
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

      if (tool === 'get_financial_metrics' && data.metrics) {
        const m = data.metrics
        const statCards: StatCardData[] = [
          {
            title: `${periodLabel ? `${periodLabel} ` : ''}合約總簽約額`,
            value: `NT$ ${m.contractedAmount.toLocaleString()}`,
            subtitle: `期間實收 NT$ ${m.totalCollectedAmount.toLocaleString()}`,
            color: 'emerald',
          },
          {
            title: `${periodLabel ? `${periodLabel} ` : ''}銷課實現營收`,
            value: `NT$ ${m.realizedLessonRevenue.toLocaleString()}`,
            subtitle: `已履約 ${m.realizedLessonSessions} 堂 (均價 NT$ ${m.averageSessionPrice.toLocaleString()})`,
            color: 'purple',
          },
          {
            title: '預收學費負債餘額',
            value: `NT$ ${m.unearnedRevenueLiabilityBalance.toLocaleString()}`,
            subtitle: `全期實收扣銷課 NT$ ${m.allTimeNetCollectedMinusRealized.toLocaleString()}`,
            color: 'amber',
          },
          {
            title: `${periodLabel ? `${periodLabel} ` : ''}權責制淨損益`,
            value: `NT$ ${m.operatingAccrualNetProfit.toLocaleString()}`,
            subtitle: `營業收入 NT$ ${m.operatingAccrualRevenue.toLocaleString()}`,
            color: m.operatingAccrualNetProfit >= 0 ? 'emerald' : 'red',
          },
        ]
        blocks.push({ type: 'stat_card_group', data: statCards })
      } else if (tool === 'reconcile_financial_metrics') {
        const statCards: StatCardData[] = [
          {
            title: data.sideAName,
            value: `NT$ ${Number(data.sideATotal || 0).toLocaleString()}`,
            color: 'stone',
          },
          {
            title: data.sideBName,
            value: `NT$ ${Number(data.sideBTotal || 0).toLocaleString()}`,
            color: 'stone',
          },
          {
            title: '勾稽差額 (A - B)',
            value: `NT$ ${Number(data.differenceTotal || 0).toLocaleString()}`,
            subtitle: data.isBalanced ? '完全平衡無差額' : '存在差異項',
            color: data.isBalanced ? 'emerald' : 'orange',
          },
        ]
        blocks.push({ type: 'stat_card_group', data: statCards })

        if (data.discrepancies && data.discrepancies.length > 0) {
          const tableData: TableComponentData = {
            title: `${data.title} - 明細差額清單`,
            columns: [
              { key: 'code', label: '編號', type: 'text' },
              { key: 'name', label: '對象/合約', type: 'text' },
              { key: 'sideAValue', label: '項目 A 金額', type: 'currency', align: 'right' },
              { key: 'sideBValue', label: '項目 B 金額', type: 'currency', align: 'right' },
              { key: 'difference', label: '差額', type: 'currency', align: 'right' },
              { key: 'reason', label: '會計原因分析', type: 'text' },
            ],
            rows: data.discrepancies,
            totalCount: data.discrepancies.length,
          }
          blocks.push({ type: 'table', data: tableData })
        }
      } else if (tool === 'query_cash_flow_records') {
        const statCards: StatCardData[] = []
        const prefix = periodLabel ? `${periodLabel} ` : ''

        if (data.filterCategory) {
          const isIncome = (data.filteredIncome || 0) > 0 && (data.filteredExpense || 0) === 0
          statCards.push({
            title: `${prefix}「${data.filterCategory}」合計`,
            value: `NT$ ${(data.filteredTotalAmount ?? data.totalIncome).toLocaleString()}`,
            subtitle: `共 ${data.totalRecordsFound} 筆明細`,
            color: isIncome ? 'emerald' : 'red',
          })
          statCards.push({
            title: `${prefix}全場館總收入`,
            value: `NT$ ${(data.periodTotalIncome ?? data.totalIncome).toLocaleString()}`,
            subtitle: '包含所有收入類別',
            color: 'emerald',
          })
          statCards.push({
            title: `${prefix}全場館總支出`,
            value: `NT$ ${(data.periodTotalExpense ?? data.totalExpense).toLocaleString()}`,
            subtitle: '包含房租、水電等實際支出',
            color: 'red',
          })
          statCards.push({
            title: `${prefix}淨現金流`,
            value: `NT$ ${(data.periodNetCashFlow ?? data.netCashFlow).toLocaleString()}`,
            subtitle: '總收入 - 總支出',
            color: (data.periodNetCashFlow ?? data.netCashFlow) >= 0 ? 'emerald' : 'red',
          })
        } else if (data.filterType === 'income') {
          statCards.push({
            title: `${prefix}查詢收入合計`,
            value: `NT$ ${(data.filteredIncome ?? data.totalIncome).toLocaleString()}`,
            subtitle: `共 ${data.totalRecordsFound} 筆`,
            color: 'emerald',
          })
          statCards.push({
            title: `${prefix}全場館總支出`,
            value: `NT$ ${(data.periodTotalExpense ?? data.totalExpense).toLocaleString()}`,
            subtitle: '包含房租、水電等實際支出',
            color: 'red',
          })
          statCards.push({
            title: `${prefix}淨現金流`,
            value: `NT$ ${(data.periodNetCashFlow ?? data.netCashFlow).toLocaleString()}`,
            color: (data.periodNetCashFlow ?? data.netCashFlow) >= 0 ? 'emerald' : 'red',
          })
        } else if (data.filterType === 'expense') {
          statCards.push({
            title: `${prefix}查詢支出合計`,
            value: `NT$ ${(data.filteredExpense ?? data.totalExpense).toLocaleString()}`,
            subtitle: `共 ${data.totalRecordsFound} 筆`,
            color: 'red',
          })
          statCards.push({
            title: `${prefix}全場館總收入`,
            value: `NT$ ${(data.periodTotalIncome ?? data.totalIncome).toLocaleString()}`,
            color: 'emerald',
          })
          statCards.push({
            title: `${prefix}淨現金流`,
            value: `NT$ ${(data.periodNetCashFlow ?? data.netCashFlow).toLocaleString()}`,
            color: (data.periodNetCashFlow ?? data.netCashFlow) >= 0 ? 'emerald' : 'red',
          })
        } else {
          statCards.push(
            {
              title: `${prefix}總收入`,
              value: `NT$ ${(data.periodTotalIncome ?? data.totalIncome).toLocaleString()}`,
              color: 'emerald',
            },
            {
              title: `${prefix}總支出`,
              value: `NT$ ${(data.periodTotalExpense ?? data.totalExpense).toLocaleString()}`,
              color: 'red',
            },
            {
              title: `${prefix}淨現金流`,
              value: `NT$ ${(data.periodNetCashFlow ?? data.netCashFlow).toLocaleString()}`,
              color: (data.periodNetCashFlow ?? data.netCashFlow) >= 0 ? 'emerald' : 'red',
            }
          )
        }
        blocks.push({ type: 'stat_card_group', data: statCards })

        // Data table
        if (data.records && data.records.length > 0) {
          const tableTitle = data.filterCategory
            ? `${prefix}「${data.filterCategory}」明細列表 (共 ${data.totalRecordsFound} 筆)`
            : `${prefix}收支明細列表 (共 ${data.totalRecordsFound} 筆)`

          const summaryDesc = data.filterCategory
            ? `共 ${data.totalRecordsFound} 筆，小計 NT$ ${(data.filteredTotalAmount ?? data.totalIncome).toLocaleString()}（當期全場館總支出 NT$ ${(data.periodTotalExpense ?? data.totalExpense).toLocaleString()}）`
            : `總收入 ${(data.periodTotalIncome ?? data.totalIncome).toLocaleString()} / 總支出 ${(data.periodTotalExpense ?? data.totalExpense).toLocaleString()}`

          const tableData: TableComponentData = {
            title: tableTitle,
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
              date: data.filterCategory ? '類別小計' : '總計',
              type: '-',
              category: data.filterCategory || '-',
              amount: data.filterCategory
                ? data.filteredTotalAmount ?? data.totalIncome
                : (data.periodTotalIncome ?? data.totalIncome) - (data.periodTotalExpense ?? data.totalExpense),
              description: summaryDesc,
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
        const realizedSessions = data.realizedLessonSessions ?? data.realizedLessonCount ?? 0
        const avgPrice = data.averageSessionPrice ? ` (均堂價 NT$ ${data.averageSessionPrice.toLocaleString()})` : ''
        const liability = data.unearnedRevenueLiabilityBalance ?? data.unearnedRevenueEstimate ?? 0

        const statCards: StatCardData[] = [
          {
            title: `${periodLabel ? `${periodLabel} ` : ''}實收款總額`,
            value: `NT$ ${(data.periodTotalPaidAmount || 0).toLocaleString()}`,
            subtitle: `一次付清 ${(data.lumpSumPaidAmount || 0).toLocaleString()} · 分期已付 ${(data.installmentPaidAmount || 0).toLocaleString()}`,
            color: 'emerald',
          },
          {
            title: `${periodLabel ? `${periodLabel} ` : ''}銷課實現營收`,
            value: `NT$ ${(data.realizedLessonRevenue || 0).toLocaleString()}`,
            subtitle: `已履約 ${realizedSessions} 堂課${avgPrice}`,
            color: 'purple',
          },
          {
            title: '預收學費負債餘額',
            value: `NT$ ${liability.toLocaleString()}`,
            subtitle: `有效合約待履約堂數：${data.activeContractsRemainingSessions || 0} 堂`,
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
      `查詢 ${centerName} 本月核心財務指標`,
      `進行 ${centerName} 實收款與銷課金額勾稽對帳`,
      `查看 ${centerName} 今年度損益佔比`,
      `查詢 ${centerName} 本月課程收入明細`,
    ]

    return {
      conversationId,
      messageId,
      domain: 'accounting',
      text: replyText,
      blocks,
      suggestedQuestions,
      compaction: compactionInfo,
      metadata: {
        centerId,
        userId: contextMeta?.userId,
        sessionId: contextMeta?.sessionId,
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
      compaction: compactionInfo,
      metadata: {
        centerId,
        userId: contextMeta?.userId,
        sessionId: contextMeta?.sessionId,
        executedTools,
        timestamp,
        model: AGENT_MODEL,
        reasoningEffort,
      },
    }
  }
}

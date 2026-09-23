export type Domain = 'accounting' | 'out_of_scope' | 'general'

export type UIComponentType = 'text' | 'table' | 'stat_card_group' | 'alert_box'

export interface TableColumn {
  key: string
  label: string
  align?: 'left' | 'center' | 'right'
  type?: 'text' | 'currency' | 'date' | 'badge'
}

export interface TableComponentData {
  title?: string
  columns: TableColumn[]
  rows: Record<string, any>[]
  summaryRow?: Record<string, any>
  totalCount: number
}

export interface StatCardData {
  title: string
  value: string | number
  subtitle?: string
  color?: 'emerald' | 'amber' | 'purple' | 'red' | 'stone' | 'orange'
}

export interface AlertBoxData {
  title: string
  message: string
  type: 'info' | 'warning'
}

export interface StructuredAIBlock {
  type: UIComponentType
  data: string | TableComponentData | StatCardData[] | AlertBoxData
}

export interface AIAssistantResponse {
  conversationId: string
  messageId: string
  domain: Domain
  text: string
  blocks: StructuredAIBlock[]
  suggestedQuestions?: string[]
  metadata: {
    centerId: string
    executedTools: string[]
    timestamp: number
    model?: string
    reasoningEffort?: string
  }
}

export interface AIChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  responsePayload?: AIAssistantResponse
  timestamp: number
}

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AIChatMessage, AIAssistantResponse } from '@/types/ai'
import { askAccountingAI } from '@/services/aiService'

export const getDefaultWelcomeMessage = (centerId: string): AIChatMessage => {
  const centerName = centerId === 'coffit' ? 'COFFIT' : 'R27'
  return {
    id: `welcome_${centerId}_init`,
    role: 'assistant',
    content: `您好！我是 【${centerName}】 會計 AI 助理（搭載 OpenAI gpt-5.6-luna）。\n您可以直接問我「查詢上月課程收入」、「本月損益狀況」、「預收學費負債餘額」或「合約收款狀態」等會計問題！`,
    timestamp: Date.now(),
  }
}

interface AIAssistantState {
  isOpen: boolean
  isLoading: boolean
  error: string | null
  messagesByCenter: Record<string, AIChatMessage[]>
  prefillPrompt: string | null

  // Actions
  toggleOpen: () => void
  setIsOpen: (open: boolean) => void
  setPrefillPrompt: (prompt: string | null) => void
  clearMessages: (centerId: string) => void
  sendMessage: (text: string, centerId: string) => Promise<void>
}

export const useAIAssistantStore = create<AIAssistantState>()(
  persist(
    (set, get) => ({
      isOpen: false,
      isLoading: false,
      error: null,
      messagesByCenter: {
        r27: [getDefaultWelcomeMessage('r27')],
        coffit: [getDefaultWelcomeMessage('coffit')],
      },
      prefillPrompt: null,

      toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),
      setIsOpen: (open) => set({ isOpen: open }),
      setPrefillPrompt: (prompt) => set({ prefillPrompt: prompt }),

      clearMessages: (centerId: string) => {
        const centerName = centerId === 'coffit' ? 'COFFIT' : 'R27'
        set((state) => ({
          messagesByCenter: {
            ...state.messagesByCenter,
            [centerId]: [
              {
                id: `welcome_${centerId}_${Date.now()}`,
                role: 'assistant',
                content: `【${centerName}】對話紀錄已清除。您可以重新詢問任何會計與財務數據！`,
                timestamp: Date.now(),
              },
            ],
          },
          error: null,
        }))
      },

      sendMessage: async (text: string, centerId: string) => {
        const trimmed = text.trim()
        if (!trimmed) return

        const userMsgId = `user_${Date.now()}`
        const userMsg: AIChatMessage = {
          id: userMsgId,
          role: 'user',
          content: trimmed,
          timestamp: Date.now(),
        }

        const currentCenterMessages =
          get().messagesByCenter[centerId] || [getDefaultWelcomeMessage(centerId)]

        set((state) => ({
          messagesByCenter: {
            ...state.messagesByCenter,
            [centerId]: [...currentCenterMessages, userMsg],
          },
          isLoading: true,
          error: null,
        }))

        try {
          // Pass ONLY this center's conversation history to backend
          const response: AIAssistantResponse = await askAccountingAI(
            trimmed,
            centerId,
            currentCenterMessages
          )

          const assistantMsgId = `asst_${Date.now()}`
          const assistantMsg: AIChatMessage = {
            id: assistantMsgId,
            role: 'assistant',
            content: response.text,
            responsePayload: response,
            timestamp: Date.now(),
          }

          set((state) => ({
            messagesByCenter: {
              ...state.messagesByCenter,
              [centerId]: [...(state.messagesByCenter[centerId] || []), assistantMsg],
            },
            isLoading: false,
            error: null,
          }))
        } catch (err: any) {
          const errorMsg = err?.message || '傳送訊息失敗，請確認網路或 API 狀態。'
          set((state) => ({
            isLoading: false,
            error: errorMsg,
            messagesByCenter: {
              ...state.messagesByCenter,
              [centerId]: [
                ...(state.messagesByCenter[centerId] || []),
                {
                  id: `err_${Date.now()}`,
                  role: 'assistant',
                  content: `發生錯誤：${errorMsg}`,
                  timestamp: Date.now(),
                },
              ],
            },
          }))
        }
      },
    }),
    {
      name: 'r27_ai_assistant_storage',
      version: 2,
      migrate: (persistedState: any, version: number) => {
        if (version < 2 && persistedState) {
          const oldMessages = persistedState.messages || []
          return {
            ...persistedState,
            messagesByCenter: {
              r27: oldMessages.length > 0 ? oldMessages : [getDefaultWelcomeMessage('r27')],
              coffit: [getDefaultWelcomeMessage('coffit')],
            },
          }
        }
        return persistedState as AIAssistantState
      },
      partialize: (state) => {
        const sanitized: Record<string, AIChatMessage[]> = {}
        for (const [cId, msgs] of Object.entries(state.messagesByCenter || {})) {
          sanitized[cId] = (msgs || []).slice(-20)
        }
        return { messagesByCenter: sanitized }
      },
    }
  )
)

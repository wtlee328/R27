import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AIChatMessage, AIAssistantResponse } from '@/types/ai'
import { askAccountingAI } from '@/services/aiService'

interface AIAssistantState {
  isOpen: boolean
  isLoading: boolean
  error: string | null
  messages: AIChatMessage[]
  prefillPrompt: string | null

  // Actions
  toggleOpen: () => void
  setIsOpen: (open: boolean) => void
  setPrefillPrompt: (prompt: string | null) => void
  clearMessages: () => void
  sendMessage: (text: string, centerId: string) => Promise<void>
}

export const useAIAssistantStore = create<AIAssistantState>()(
  persist(
    (set, get) => ({
      isOpen: false,
      isLoading: false,
      error: null,
      messages: [
        {
          id: 'welcome_msg',
          role: 'assistant',
          content:
            '您好！我是 R27 會計 AI 助理（搭載 OpenAI gpt-5.6-luna）。\n您可以直接問我「查詢上月課程收入」、「本月損益狀況」、「預收學費負債餘額」或「合約收款狀態」等會計問題！',
          timestamp: Date.now(),
        },
      ],
      prefillPrompt: null,

      toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),
      setIsOpen: (open) => set({ isOpen: open }),
      setPrefillPrompt: (prompt) => set({ prefillPrompt: prompt }),
      clearMessages: () =>
        set({
          messages: [
            {
              id: `welcome_${Date.now()}`,
              role: 'assistant',
              content:
                '對話紀錄已清除。您可以重新詢問任何會計與財務數據！',
              timestamp: Date.now(),
            },
          ],
          error: null,
        }),

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

        const currentHistory = get().messages

        set((state) => ({
          messages: [...state.messages, userMsg],
          isLoading: true,
          error: null,
        }))

        try {
          const response: AIAssistantResponse = await askAccountingAI(
            trimmed,
            centerId,
            currentHistory
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
            messages: [...state.messages, assistantMsg],
            isLoading: false,
            error: null,
          }))
        } catch (err: any) {
          const errorMsg = err?.message || '傳送訊息失敗，請確認網路或 API 狀態。'
          set((state) => ({
            isLoading: false,
            error: errorMsg,
            messages: [
              ...state.messages,
              {
                id: `err_${Date.now()}`,
                role: 'assistant',
                content: `發生錯誤：${errorMsg}`,
                timestamp: Date.now(),
              },
            ],
          }))
        }
      },
    }),
    {
      name: 'r27_ai_assistant_storage',
      partialize: (state) => ({ messages: state.messages.slice(-20) }),
    }
  )
)

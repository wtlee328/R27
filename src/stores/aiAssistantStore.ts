import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AIChatMessage, AIAssistantResponse, AIChatSession } from '@/types/ai'
import { askAccountingAI } from '@/services/aiService'
import { auth } from '@/lib/firebase'

export const getDefaultWelcomeMessage = (centerId: string): AIChatMessage => {
  const centerName = centerId === 'coffit' ? 'COFFIT' : 'R27'
  return {
    id: `welcome_${centerId}_init`,
    role: 'assistant',
    content: `您好！我是 【${centerName}】 會計 AI 助理（搭載 OpenAI gpt-6-luna）。\n您可以直接問我「查詢上月課程收入」、「本月損益狀況」、「預收學費負債餘額」或「合約收款狀態」等會計問題！`,
    timestamp: Date.now(),
  }
}

function getCurrentUserId(): string {
  return auth.currentUser?.uid || 'default_admin'
}

function createDefaultSession(userId: string, centerId: string, customId?: string): AIChatSession {
  const sessionId = customId || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  return {
    id: sessionId,
    centerId,
    userId,
    title: '新對話會話',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [getDefaultWelcomeMessage(centerId)],
  }
}

interface AIAssistantState {
  isOpen: boolean
  isLoading: boolean
  error: string | null
  prefillPrompt: string | null

  // User & Session Isolation Storage:
  // userSessions[userId][centerId][sessionId] = AIChatSession
  userSessions: Record<string, Record<string, Record<string, AIChatSession>>>
  // activeSessionId[userId][centerId] = current active sessionId
  activeSessionId: Record<string, Record<string, string>>

  // Synced convenience view for current active user & center
  messagesByCenter: Record<string, AIChatMessage[]>

  // Actions
  toggleOpen: () => void
  setIsOpen: (open: boolean) => void
  setPrefillPrompt: (prompt: string | null) => void
  startNewSession: (centerId: string) => string
  clearMessages: (centerId: string) => void
  sendMessage: (text: string, centerId: string) => Promise<void>
  getActiveSessionId: (centerId: string) => string
}

export const useAIAssistantStore = create<AIAssistantState>()(
  persist(
    (set, get) => ({
      isOpen: false,
      isLoading: false,
      error: null,
      prefillPrompt: null,
      userSessions: {},
      activeSessionId: {},
      messagesByCenter: {
        r27: [getDefaultWelcomeMessage('r27')],
        coffit: [getDefaultWelcomeMessage('coffit')],
      },

      toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),
      setIsOpen: (open) => set({ isOpen: open }),
      setPrefillPrompt: (prompt) => set({ prefillPrompt: prompt }),

      getActiveSessionId: (centerId: string) => {
        const userId = getCurrentUserId()
        const active = get().activeSessionId?.[userId]?.[centerId]
        if (active) return active

        // Auto-create initial session if missing
        const newSession = createDefaultSession(userId, centerId)
        set((state) => ({
          userSessions: {
            ...state.userSessions,
            [userId]: {
              ...(state.userSessions?.[userId] || {}),
              [centerId]: {
                ...(state.userSessions?.[userId]?.[centerId] || {}),
                [newSession.id]: newSession,
              },
            },
          },
          activeSessionId: {
            ...state.activeSessionId,
            [userId]: {
              ...(state.activeSessionId?.[userId] || {}),
              [centerId]: newSession.id,
            },
          },
          messagesByCenter: {
            ...state.messagesByCenter,
            [centerId]: newSession.messages,
          },
        }))
        return newSession.id
      },

      /**
       * 🔄 Starts a fresh isolated session for the current user & center
       */
      startNewSession: (centerId: string) => {
        const userId = getCurrentUserId()
        const newSession = createDefaultSession(userId, centerId)

        set((state) => ({
          userSessions: {
            ...state.userSessions,
            [userId]: {
              ...(state.userSessions?.[userId] || {}),
              [centerId]: {
                ...(state.userSessions?.[userId]?.[centerId] || {}),
                [newSession.id]: newSession,
              },
            },
          },
          activeSessionId: {
            ...state.activeSessionId,
            [userId]: {
              ...(state.activeSessionId?.[userId] || {}),
              [centerId]: newSession.id,
            },
          },
          messagesByCenter: {
            ...state.messagesByCenter,
            [centerId]: newSession.messages,
          },
          error: null,
        }))

        return newSession.id
      },

      clearMessages: (centerId: string) => {
        const userId = getCurrentUserId()
        const centerName = centerId === 'coffit' ? 'COFFIT' : 'R27'
        const currentSessionId = get().getActiveSessionId(centerId)

        const clearedMessage: AIChatMessage = {
          id: `welcome_${centerId}_${Date.now()}`,
          role: 'assistant',
          content: `【${centerName}】此會話對話紀錄已清除。您可以重新詢問任何會計與財務數據！`,
          timestamp: Date.now(),
        }

        set((state) => {
          const userCenterSessions = state.userSessions?.[userId]?.[centerId] || {}
          const existingSession = userCenterSessions[currentSessionId] || createDefaultSession(userId, centerId, currentSessionId)

          const updatedSession: AIChatSession = {
            ...existingSession,
            messages: [clearedMessage],
            updatedAt: Date.now(),
          }

          return {
            userSessions: {
              ...state.userSessions,
              [userId]: {
                ...(state.userSessions?.[userId] || {}),
                [centerId]: {
                  ...userCenterSessions,
                  [currentSessionId]: updatedSession,
                },
              },
            },
            messagesByCenter: {
              ...state.messagesByCenter,
              [centerId]: [clearedMessage],
            },
            error: null,
          }
        })
      },

      sendMessage: async (text: string, centerId: string) => {
        const trimmed = text.trim()
        if (!trimmed) return

        const userId = getCurrentUserId()
        const currentSessionId = get().getActiveSessionId(centerId)

        const userMsgId = `user_${Date.now()}`
        const userMsg: AIChatMessage = {
          id: userMsgId,
          role: 'user',
          content: trimmed,
          timestamp: Date.now(),
        }

        const stateBefore = get()
        const userCenterSessions = stateBefore.userSessions?.[userId]?.[centerId] || {}
        const currentSession =
          userCenterSessions[currentSessionId] || createDefaultSession(userId, centerId, currentSessionId)

        const sessionMessagesWithUser = [...currentSession.messages, userMsg]

        set((state) => ({
          userSessions: {
            ...state.userSessions,
            [userId]: {
              ...(state.userSessions?.[userId] || {}),
              [centerId]: {
                ...userCenterSessions,
                [currentSessionId]: {
                  ...currentSession,
                  messages: sessionMessagesWithUser,
                  updatedAt: Date.now(),
                },
              },
            },
          },
          messagesByCenter: {
            ...state.messagesByCenter,
            [centerId]: sessionMessagesWithUser,
          },
          isLoading: true,
          error: null,
        }))

        try {
          // Pass ONLY this user's current session conversation history & sessionId to backend
          const response: AIAssistantResponse = await askAccountingAI(
            trimmed,
            centerId,
            sessionMessagesWithUser,
            currentSessionId
          )

          const assistantMsgId = `asst_${Date.now()}`
          const assistantMsg: AIChatMessage = {
            id: assistantMsgId,
            role: 'assistant',
            content: response.text,
            responsePayload: response,
            timestamp: Date.now(),
          }

          set((state) => {
            const currentUCSessions = state.userSessions?.[userId]?.[centerId] || {}
            const existing = currentUCSessions[currentSessionId] || currentSession
            let updatedMessages = [...existing.messages, assistantMsg]

            // If backend performed memory compaction (60% context window threshold),
            // fold older messages in this specific session into a structured summary node
            if (response.compaction?.compacted && response.compaction.summary) {
              const summaryMsg: AIChatMessage = {
                id: `summary_${Date.now()}`,
                role: 'system',
                content: response.compaction.summary,
                isCompactedSummary: true,
                timestamp: Date.now(),
              }

              // Keep recent 5 messages (recent turns + the new assistant response)
              const RECENT_TO_KEEP = 5
              const recentSlice = updatedMessages.slice(-RECENT_TO_KEEP)
              updatedMessages = [summaryMsg, ...recentSlice]
            }

            const finalSession: AIChatSession = {
              ...existing,
              messages: updatedMessages,
              updatedAt: Date.now(),
            }

            return {
              userSessions: {
                ...state.userSessions,
                [userId]: {
                  ...(state.userSessions?.[userId] || {}),
                  [centerId]: {
                    ...currentUCSessions,
                    [currentSessionId]: finalSession,
                  },
                },
              },
              messagesByCenter: {
                ...state.messagesByCenter,
                [centerId]: updatedMessages,
              },
              isLoading: false,
              error: null,
            }
          })
        } catch (err: any) {
          const errorMsg = err?.message || '傳送訊息失敗，請確認網路或 API 狀態。'
          set((state) => {
            const currentUCSessions = state.userSessions?.[userId]?.[centerId] || {}
            const existing = currentUCSessions[currentSessionId] || currentSession

            const errMessage: AIChatMessage = {
              id: `err_${Date.now()}`,
              role: 'assistant',
              content: `發生錯誤：${errorMsg}`,
              timestamp: Date.now(),
            }
            const withErrMessages = [...existing.messages, errMessage]

            return {
              isLoading: false,
              error: errorMsg,
              userSessions: {
                ...state.userSessions,
                [userId]: {
                  ...(state.userSessions?.[userId] || {}),
                  [centerId]: {
                    ...currentUCSessions,
                    [currentSessionId]: {
                      ...existing,
                      messages: withErrMessages,
                      updatedAt: Date.now(),
                    },
                  },
                },
              },
              messagesByCenter: {
                ...state.messagesByCenter,
                [centerId]: withErrMessages,
              },
            }
          })
        }
      },
    }),
    {
      name: 'r27_ai_assistant_storage_v3',
      version: 3,
      migrate: (persistedState: any, version: number) => {
        if (version < 3 && persistedState) {
          const oldMessagesByCenter = persistedState.messagesByCenter || {}
          const defaultUid = 'default_admin'
          const migratedSessions: Record<string, Record<string, Record<string, AIChatSession>>> = {
            [defaultUid]: {},
          }
          const migratedActive: Record<string, Record<string, string>> = {
            [defaultUid]: {},
          }

          for (const [centerId, msgs] of Object.entries(oldMessagesByCenter)) {
            const sessId = `sess_migrated_${centerId}`
            migratedSessions[defaultUid][centerId] = {
              [sessId]: {
                id: sessId,
                centerId,
                userId: defaultUid,
                title: '歷史會話',
                createdAt: Date.now(),
                updatedAt: Date.now(),
                messages: msgs as AIChatMessage[],
              },
            }
            migratedActive[defaultUid][centerId] = sessId
          }

          return {
            ...persistedState,
            userSessions: migratedSessions,
            activeSessionId: migratedActive,
          }
        }
        return persistedState as AIAssistantState
      },
    }
  )
)

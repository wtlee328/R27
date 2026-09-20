import React, { useState, useRef, useEffect } from 'react'
import {
  Sparkles,
  Send,
  Trash2,
  Loader2,
  Building2,
  HelpCircle,
  CornerDownLeft,
} from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { useAIAssistantStore } from '@/stores/aiAssistantStore'
import { useCenterStore } from '@/stores/centerStore'
import { StructuredBlockRenderer } from './StructuredBlockRenderer'

const DEFAULT_PROMPTS = [
  '查詢本月課程收入明細與總額',
  '查看今年度累積損益狀況',
  '目前預收學費負債餘額還有多少？',
  '查詢未付清或分期逾期的合約',
]

export const AIAssistantDrawer: React.FC = () => {
  const { isOpen, setIsOpen, messages, isLoading, sendMessage, clearMessages, prefillPrompt, setPrefillPrompt } =
    useAIAssistantStore()
  const { centerId } = useCenterStore()

  const [inputMessage, setInputMessage] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom when messages change or loading
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Focus input when drawer opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus()
      }, 150)
    }
  }, [isOpen])

  // Handle prefill prompt from external components
  useEffect(() => {
    if (prefillPrompt) {
      setInputMessage(prefillPrompt)
      setPrefillPrompt(null)
      if (!isOpen) setIsOpen(true)
    }
  }, [prefillPrompt, isOpen, setIsOpen, setPrefillPrompt])

  const handleSend = async (textToSend?: string) => {
    const text = textToSend || inputMessage
    if (!text.trim() || isLoading) return

    setInputMessage('')
    await sendMessage(text, centerId)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl p-0 flex flex-col h-full bg-stone-50 dark:bg-stone-950 border-l border-stone-200 dark:border-stone-800 shadow-2xl"
      >
        {/* Header */}
        <SheetHeader className="px-5 py-3.5 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 flex flex-row items-center justify-between space-y-0 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-orange-500/10 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 flex items-center justify-center shadow-xs">
              <Sparkles className="w-4.5 h-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <SheetTitle className="text-sm font-bold text-stone-900 dark:text-white">
                  會計 AI 助理
                </SheetTitle>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4.5 font-mono text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800/60 bg-orange-50/50 dark:bg-orange-950/30">
                  gpt-5.6-luna
                </Badge>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                <Building2 className="w-3 h-3" />
                <span>目前場館：<strong className="text-stone-800 dark:text-stone-200 uppercase">{centerId}</strong></span>
                <span className="mx-1">•</span>
                <span>唯讀安全查詢</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 pr-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={clearMessages}
              className="h-8 px-2 text-xs text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white gap-1"
              title="清空對話紀錄"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">清除紀錄</span>
            </Button>
          </div>
        </SheetHeader>

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-4">
          {/* Quick Prompts Chips if first message */}
          {messages.length <= 1 && (
            <div className="p-4 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 shadow-xs mb-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-700 dark:text-stone-300 mb-2.5">
                <HelpCircle className="w-3.5 h-3.5 text-orange-500" />
                常見財務快捷提問：
              </div>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_PROMPTS.map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(prompt)}
                    className="text-xs px-3 py-1.5 rounded-full bg-stone-100 hover:bg-orange-50 hover:text-orange-700 hover:border-orange-300 dark:bg-stone-800 dark:hover:bg-orange-950/40 dark:hover:text-orange-300 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 transition-all text-left cursor-pointer"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Conversation history bubbles */}
          {messages.map((msg) => {
            const isUser = msg.role === 'user'

            if (isUser) {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-xs px-4 py-2.5 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs sm:text-sm leading-relaxed shadow-xs">
                    {msg.content}
                  </div>
                </div>
              )
            }

            // Assistant message
            const responsePayload = msg.responsePayload
            const blocks = responsePayload?.blocks || []
            const suggestedQuestions = responsePayload?.suggestedQuestions || []

            return (
              <div key={msg.id} className="flex flex-col items-start gap-1">
                <div className="w-full rounded-2xl rounded-tl-xs px-4 sm:px-5 py-3.5 bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 text-stone-900 dark:text-stone-100 text-xs sm:text-sm shadow-xs">
                  {/* Assistant Text / Summary */}
                  <div className="leading-relaxed whitespace-pre-wrap font-sans text-stone-800 dark:text-stone-200">
                    {msg.content}
                  </div>

                  {/* Structured Dynamic Blocks (StatCards, Tables, Alerts) */}
                  {blocks.length > 0 && <StructuredBlockRenderer blocks={blocks} />}

                  {/* Suggested follow-up questions */}
                  {suggestedQuestions.length > 0 && (
                    <div className="mt-3.5 pt-3 border-t border-stone-100 dark:border-stone-800/80">
                      <div className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 mb-1.5 flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-orange-500" />
                        建議延伸問題：
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {suggestedQuestions.map((q, qIdx) => (
                          <button
                            key={qIdx}
                            onClick={() => handleSend(q)}
                            className="text-[11px] px-2.5 py-1 rounded-lg bg-stone-50 hover:bg-orange-50 hover:text-orange-700 hover:border-orange-200 dark:bg-stone-800/70 dark:hover:bg-orange-950/40 dark:hover:text-orange-300 border border-stone-200/80 dark:border-stone-700 text-stone-600 dark:text-stone-300 transition-all cursor-pointer text-left"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {/* Loading Indicator */}
          {isLoading && (
            <div className="flex items-center gap-2 p-3.5 rounded-2xl rounded-tl-xs bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 text-xs text-stone-600 dark:text-stone-400 shadow-xs">
              <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />
              <span>會計 AI 分析與計算中 (gpt-5.6-luna)...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Footer */}
        <div className="p-3 sm:p-4 bg-white dark:bg-stone-900 border-t border-stone-200 dark:border-stone-800 shrink-0">
          <div className="relative rounded-2xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/60 focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/20 transition-all p-1.5">
            <Textarea
              ref={inputRef}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="詢問會計或財務問題（例如：上月課程收入總計多少？）..."
              className="w-full bg-transparent border-none resize-none focus-visible:ring-0 text-xs sm:text-sm min-h-[56px] max-h-[140px] text-stone-900 dark:text-stone-100 placeholder:text-stone-400"
              rows={2}
              disabled={isLoading}
            />
            <div className="flex items-center justify-between px-2 pt-1">
              <div className="text-[10px] text-stone-400 hidden sm:flex items-center gap-1">
                <span>按 Enter 送出</span>
                <CornerDownLeft className="w-2.5 h-2.5" />
                <span>，Shift + Enter 換行</span>
              </div>
              <div className="flex items-center gap-1 ml-auto">
                <Button
                  size="sm"
                  onClick={() => handleSend()}
                  disabled={!inputMessage.trim() || isLoading}
                  className="h-8 px-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-medium text-xs gap-1.5 cursor-pointer shadow-xs disabled:opacity-40"
                >
                  {isLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <span>送出</span>
                      <Send className="w-3 h-3" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

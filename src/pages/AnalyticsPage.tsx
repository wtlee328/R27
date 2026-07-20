import { useState, useEffect, useMemo } from 'react'
import {
  RiLineChartLine,
  RiTeamLine,
  RiPieChartLine,
  RiCalendarCheckLine,
  RiAlertLine,
  RiUserForbidLine,
  RiPulseLine,
  RiFireLine,
  RiFilter3Line,
  RiBarChartBoxLine,
  RiSparklingLine,
  RiCheckboxCircleLine,
  RiMedalLine,
} from '@remixicon/react'
import { StatCard } from '../components/shared/StatCard'
import { Progress } from '../components/ui/progress'
import { Badge } from '../components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/ui/table'
import { useCustomers } from '../hooks/useCustomers'
import { useContracts } from '../hooks/useContracts'
import { useCashFlow } from '../hooks/useCashFlow'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { Customer, TrialRecord, Trainer } from '../types'
import { normalizeCashFlowRecord } from '../components/cashflow/CashFlowTable'

type RfmSortKey = 'frequency' | 'monetary' | 'recency'

export default function AnalyticsPage() {
  const { customers, loading: loadingCustomers } = useCustomers()
  const { contracts, loading: loadingContracts } = useContracts()
  const { records: cashFlowRecords, loading: loadingCashFlow } = useCashFlow()

  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [trials, setTrials] = useState<TrialRecord[]>([])
  const [lessons, setLessons] = useState<any[]>([])
  const [loadingExtra, setLoadingExtra] = useState(true)

  const [rfmSortBy, setRfmSortBy] = useState<RfmSortKey>('frequency')
  const now = new Date()
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>(now.getMonth() + 1)

  // Fetch extra data
  useEffect(() => {
    const fetchExtraData = async () => {
      try {
        const [trainersSnap, trialsSnap, lessonsSnap] = await Promise.all([
          getDocs(collection(db, 'trainers')),
          getDocs(collection(db, 'trialRecords')),
          getDocs(collection(db, 'lessons')),
        ])

        setTrainers(trainersSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Trainer)))
        setTrials(trialsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as TrialRecord)))
        setLessons(lessonsSnap.docs.map((d) => ({ id: d.id, ...d.data() })))
      } catch (err) {
        console.error('Error loading analytics extra data:', err)
      } finally {
        setLoadingExtra(false)
      }
    }

    fetchExtraData()
  }, [])

  const monthLabel = useMemo(() => {
    if (selectedMonth === 'all') return '全年度'
    return `${String(selectedMonth).padStart(2, '0')}月`
  }, [selectedMonth])

  const trainerMap = useMemo(() => {
    const map: Record<string, string> = {}
    trainers.forEach((t) => {
      map[t.id] = t.name
    })
    return map
  }, [trainers])

  // --- Filtered datasets ---
  const filteredTrials = useMemo(() => {
    return trials.filter((t) => {
      if (!t.createdAt) return true
      const d = (t.createdAt as any).toDate ? (t.createdAt as any).toDate() : new Date(t.createdAt as any)
      const matchesYear = d.getFullYear() === selectedYear
      const matchesMonth = selectedMonth === 'all' || d.getMonth() + 1 === selectedMonth
      return matchesYear && matchesMonth
    })
  }, [trials, selectedYear, selectedMonth])

  const filteredContracts = useMemo(() => {
    return contracts.filter((c) => {
      if (!c.startDate) return true
      const d = (c.startDate as any).toDate ? (c.startDate as any).toDate() : new Date(c.startDate as any)
      const matchesYear = d.getFullYear() === selectedYear
      const matchesMonth = selectedMonth === 'all' || d.getMonth() + 1 === selectedMonth
      return matchesYear && matchesMonth
    })
  }, [contracts, selectedYear, selectedMonth])

  const filteredCashFlowRecords = useMemo(() => {
    return cashFlowRecords.filter((r) => {
      if (!r.date) return false
      const d = r.date.toDate()
      const matchesYear = d.getFullYear() === selectedYear
      const matchesMonth = selectedMonth === 'all' || d.getMonth() + 1 === selectedMonth
      return matchesYear && matchesMonth
    })
  }, [cashFlowRecords, selectedYear, selectedMonth])

  const filteredLessons = useMemo(() => {
    return lessons.filter((l) => {
      if (!l.date) return false
      const d = l.date.toDate ? l.date.toDate() : new Date(l.date)
      const matchesYear = d.getFullYear() === selectedYear
      const matchesMonth = selectedMonth === 'all' || d.getMonth() + 1 === selectedMonth
      return matchesYear && matchesMonth
    })
  }, [lessons, selectedYear, selectedMonth])

  // --- 1. 銷售與轉換分析 ---
  const trialConversionStats = useMemo(() => {
    const total = filteredTrials.length
    const converted = filteredTrials.filter((t) => t.outcome === 'converted').length
    const rate = total > 0 ? ((converted / total) * 100).toFixed(1) : '0.0'

    const trainerTrialMap: Record<string, { total: number; converted: number }> = {}
    filteredTrials.forEach((t) => {
      if (!t.trainerId) return
      if (!trainerTrialMap[t.trainerId]) {
        trainerTrialMap[t.trainerId] = { total: 0, converted: 0 }
      }
      trainerTrialMap[t.trainerId].total += 1
      if (t.outcome === 'converted') {
        trainerTrialMap[t.trainerId].converted += 1
      }
    })

    const trainerRanking = Object.entries(trainerTrialMap)
      .map(([trainerId, data]) => ({
        trainerId,
        trainerName: trainerMap[trainerId] || '未指定教練',
        total: data.total,
        converted: data.converted,
        rate: data.total > 0 ? (data.converted / data.total) * 100 : 0,
      }))
      .sort((a, b) => b.rate - a.rate)

    return { total, converted, rate, trainerRanking }
  }, [filteredTrials, trainerMap])

  // Renewal Rate
  const renewalStats = useMemo(() => {
    const renewals = filteredContracts.filter((c) => (c as any).partnerMode === 'renewal' || (c as any).isRenewal).length
    const totalEnded = contracts.filter((c) => c.status === 'completed' || c.status === 'expired').length
    const rate = totalEnded > 0 ? ((renewals / totalEnded) * 100).toFixed(1) : '0.0'
    return { renewals, totalEnded, rate }
  }, [filteredContracts, contracts])

  // --- 2. 客群與漏斗分析 ---
  const demographics = useMemo(() => {
    const genderCount = { female: 0, male: 0, other: 0 }
    const habitCount = { none: 0, weekly_1_2: 0, weekly_3_plus: 0 }
    const channelCount: Record<string, number> = {
      Instagram: 0,
      Facebook: 0,
      'Google 搜尋': 0,
      '親友/會員介紹': 0,
      '路過/現場親洽': 0,
      其他管道: 0,
    }

    customers.forEach((c) => {
      if (c.gender === 'male') genderCount.male += 1
      else if (c.gender === 'other') genderCount.other += 1
      else genderCount.female += 1

      if (c.exerciseHabit === 'weekly_1_2') habitCount.weekly_1_2 += 1
      else if (c.exerciseHabit === 'weekly_3_plus') habitCount.weekly_3_plus += 1
      else habitCount.none += 1

      const src = c.source || 'instagram'
      if (src === 'instagram') channelCount.Instagram += 1
      else if (src === 'facebook') channelCount.Facebook += 1
      else if (src === 'google') channelCount['Google 搜尋'] += 1
      else if (src === 'referral') channelCount['親友/會員介紹'] += 1
      else if (src === 'walk_in') channelCount['路過/現場親洽'] += 1
      else channelCount.其他管道 += 1
    })

    const totalCust = customers.length || 1

    return { genderCount, habitCount, channelCount, totalCust }
  }, [customers])

  // --- 3. 合約規格分佈 ---
  const contractSpecs = useMemo(() => {
    const specMap: Record<string, number> = {
      '10堂': 0,
      '24堂': 0,
      '36堂': 0,
      '48堂': 0,
      '72堂': 0,
      其他規格: 0,
    }

    filteredContracts.forEach((c) => {
      const s = c.totalSessions
      if (s === 10) specMap['10堂'] += 1
      else if (s === 24) specMap['24堂'] += 1
      else if (s === 36) specMap['36堂'] += 1
      else if (s === 48) specMap['48堂'] += 1
      else if (s === 72) specMap['72堂'] += 1
      else specMap.其他規格 += 1
    })

    const totalCount = filteredContracts.length || 1

    return { specMap, totalCount }
  }, [filteredContracts])

  // --- 4. 每月銷課總表 12-Month Trend Bar Chart ---
  const monthlyLessonsTrend = useMemo(() => {
    const months = Array(12).fill(0)
    lessons.forEach((l) => {
      if (l.status === 'completed' && l.date) {
        const d = l.date.toDate ? l.date.toDate() : new Date(l.date)
        if (d.getFullYear() === selectedYear) {
          months[d.getMonth()] += 1
        }
      }
    })
    const maxVal = Math.max(...months, 1)
    return { months, maxVal }
  }, [lessons, selectedYear])

  // Trainer Consumption & Revenue Ranking
  const trainerPerformance = useMemo(() => {
    const map: Record<string, { sessions: number; revenue: number }> = {}

    filteredLessons.forEach((l) => {
      if (l.status === 'completed' && l.trainerId) {
        if (!map[l.trainerId]) map[l.trainerId] = { sessions: 0, revenue: 0 }
        map[l.trainerId].sessions += 1
      }
    })

    filteredCashFlowRecords.map(normalizeCashFlowRecord).forEach((r) => {
      if (r.type === 'income' && r.trainerId) {
        if (!map[r.trainerId]) map[r.trainerId] = { sessions: 0, revenue: 0 }
        map[r.trainerId].revenue += r.amount || 0
      }
    })

    const list = Object.entries(map)
      .map(([trainerId, data]) => ({
        trainerId,
        trainerName: trainerMap[trainerId] || '未指定教練',
        sessions: data.sessions,
        revenue: data.revenue,
      }))
      .sort((a, b) => b.sessions - a.sessions)

    const maxSessions = Math.max(...list.map((t) => t.sessions), 1)

    return { list, maxSessions }
  }, [filteredLessons, filteredCashFlowRecords, trainerMap])

  // --- 5. 幽靈會員預警 ---
  const churnAnalysis = useMemo(() => {
    const inactiveGhostMembers: Array<{
      customer: Customer
      lastLessonDate: Date | null
      daysInactive: number
      trainerName: string
    }> = []

    customers.forEach((cust) => {
      const custContracts = contracts.filter((c) => c.customerId === cust.id || c.sharedWithCustomerId === cust.id)
      const hasActiveContract = custContracts.some((c) => c.status === 'active' || c.status === 'expiring')

      const custLessons = lessons
        .filter((l) => l.customerId === cust.id && l.status === 'completed' && l.date)
        .map((l) => (l.date.toDate ? l.date.toDate() : new Date(l.date)))
        .sort((a, b) => b.getTime() - a.getTime())

      const lastLessonDate = custLessons.length > 0 ? custLessons[0] : null
      const daysInactive = lastLessonDate
        ? Math.floor((now.getTime() - lastLessonDate.getTime()) / (1000 * 60 * 60 * 24))
        : 999

      const upcomingBookings = lessons.filter(
        (l) => l.customerId === cust.id && l.status === 'scheduled' && l.date && (l.date.toDate ? l.date.toDate() : new Date(l.date)) > now
      )

      if (hasActiveContract && daysInactive >= 30 && upcomingBookings.length === 0) {
        const activeContract = custContracts.find((c) => c.status === 'active' || c.status === 'expiring')
        inactiveGhostMembers.push({
          customer: cust,
          lastLessonDate,
          daysInactive: daysInactive === 999 ? 30 : daysInactive,
          trainerName: activeContract ? trainerMap[activeContract.trainerId] || '未指定教練' : '未指定',
        })
      }
    })

    return {
      inactiveGhostMembers: inactiveGhostMembers.sort((a, b) => b.daysInactive - a.daysInactive),
    }
  }, [customers, contracts, lessons, trainerMap])

  // --- 6. RFM 會員活躍度 ---
  const rfmMembers = useMemo(() => {
    return customers.map((cust) => {
      const custContracts = contracts.filter((c) => c.customerId === cust.id || c.sharedWithCustomerId === cust.id)
      const totalMonetary = custContracts.reduce((sum, c) => sum + (c.totalAmount || 0), 0)

      const custLessons = lessons
        .filter((l) => l.customerId === cust.id && l.status === 'completed' && l.date)
        .map((l) => (l.date.toDate ? l.date.toDate() : new Date(l.date)))
        .sort((a, b) => b.getTime() - a.getTime())

      const lastLessonDate = custLessons.length > 0 ? custLessons[0] : null
      const recencyDays = lastLessonDate
        ? Math.floor((now.getTime() - lastLessonDate.getTime()) / (1000 * 60 * 60 * 24))
        : 999

      const frequency = (custLessons.length / 4).toFixed(1)

      return {
        customer: cust,
        recencyDays: recencyDays === 999 ? '未曾上課' : `${recencyDays} 天前`,
        recencyRaw: recencyDays,
        frequency: Number(frequency),
        totalLessonsCount: custLessons.length,
        monetary: totalMonetary,
      }
    })
  }, [customers, contracts, lessons])

  const sortedRfmMembers = useMemo(() => {
    return [...rfmMembers].sort((a, b) => {
      if (rfmSortBy === 'frequency') return b.frequency - a.frequency
      if (rfmSortBy === 'monetary') return b.monetary - a.monetary
      return a.recencyRaw - b.recencyRaw
    })
  }, [rfmMembers, rfmSortBy])

  const loading = loadingCustomers || loadingContracts || loadingCashFlow || loadingExtra

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Clean Black & Orange Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-stone-900 flex items-center gap-2.5">
            <RiBarChartBoxLine className="w-6 h-6 text-orange-500" />
            數據分析與營運儀表板
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            即時分析銷售轉換、客群結構、銷課趨勢圖表、幽靈會員與 RFM 會員活躍度
          </p>
        </div>

        {/* Timeframe Selectors */}
        <div className="flex items-center gap-2">
          <select
            className="border border-stone-200 rounded-lg px-3 py-1.5 text-xs bg-stone-50 font-bold text-stone-800 focus:outline-none focus:ring-1 focus:ring-orange-500 cursor-pointer"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
          >
            {[0, 1, 2].map((offset) => {
              const y = now.getFullYear() - offset
              return (
                <option key={y} value={y}>
                  {y} 年
                </option>
              )
            })}
          </select>

          <select
            className="border border-stone-200 rounded-lg px-3 py-1.5 text-xs bg-stone-50 font-bold text-stone-800 focus:outline-none focus:ring-1 focus:ring-orange-500 cursor-pointer"
            value={selectedMonth}
            onChange={(e) => {
              const val = e.target.value
              setSelectedMonth(val === 'all' ? 'all' : Number(val))
            }}
          >
            <option value="all">所有月份 (全年度)</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {String(m).padStart(2, '0')} 月
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="loading-spinner py-16"><span /></div>
      ) : (
        <>
          {/* Top KPI Cards (Black & Orange Brand Style) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              title={`體驗成交率 (${monthLabel})`}
              value={`${trialConversionStats.rate}%`}
              icon={RiLineChartLine}
              subtitle={`成交 ${trialConversionStats.converted} / 體驗 ${trialConversionStats.total} 人`}
            />
            <StatCard
              title={`續課率 (${monthLabel})`}
              value={`${renewalStats.rate}%`}
              icon={RiMedalLine}
              subtitle={`續約 ${renewalStats.renewals} / 到期 ${renewalStats.totalEnded} 件`}
            />
            <StatCard
              title="幽靈會員預警 (>30天)"
              value={`${churnAnalysis.inactiveGhostMembers.length} 人`}
              icon={RiAlertLine}
              subtitle="合約尚在但無未來預約"
            />
            <StatCard
              title="場館總學員數"
              value={`${customers.length} 人`}
              icon={RiTeamLine}
              subtitle="全館資料庫學員"
            />
          </div>

          {/* 📈 12-Month Lesson Trend Bar Chart (Black & Orange Accent) */}
          <Card className="border border-stone-200/80 shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between border-b border-stone-100 pb-4">
              <div>
                <CardTitle className="text-base font-bold text-stone-950 flex items-center gap-2">
                  <RiBarChartBoxLine className="w-5 h-5 text-orange-500" />
                  {selectedYear} 年度銷課趨勢圖
                </CardTitle>
                <CardDescription className="text-xs text-stone-500 mt-0.5">
                  1~12 月實際總銷課堂數起伏（當前：{monthLabel}）
                </CardDescription>
              </div>
              <Badge variant="secondary" className="bg-stone-900 text-white font-mono border-none">
                年總銷課: {monthlyLessonsTrend.months.reduce((a, b) => a + b, 0)} 堂
              </Badge>
            </CardHeader>
            <CardContent className="pt-6 pb-2">
              <div className="h-44 flex items-end justify-between gap-2 border-b border-stone-200/80 pb-2">
                {monthlyLessonsTrend.months.map((count, idx) => {
                  const monthNum = idx + 1
                  const isSelected = selectedMonth === monthNum
                  const heightPct = Math.max(8, (count / monthlyLessonsTrend.maxVal) * 100)

                  return (
                    <div key={monthNum} className="flex-1 flex flex-col items-center gap-2 group h-full justify-end">
                      <span className={`text-[10px] font-mono font-bold transition-all ${isSelected ? 'text-orange-600 font-black' : 'text-stone-400'}`}>
                        {count > 0 ? `${count}堂` : ''}
                      </span>
                      <div
                        className={`w-full rounded-t-sm transition-all duration-200 ${
                          isSelected
                            ? 'bg-gradient-to-t from-orange-600 to-amber-500 shadow-sm shadow-orange-200'
                            : 'bg-stone-950 group-hover:bg-stone-800'
                        }`}
                        style={{ height: `${heightPct}%` }}
                      />
                      <span className={`text-xs font-bold ${isSelected ? 'text-orange-600 font-black' : 'text-stone-600'}`}>
                        {monthNum}月
                      </span>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Section 2: 渠道轉化 & 客群結構 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 🎯 渠道轉化漏斗條狀圖 */}
            <Card className="border border-stone-200/80 shadow-xs">
              <CardHeader className="border-b border-stone-100 pb-4">
                <CardTitle className="text-base font-bold text-stone-950 flex items-center gap-2">
                  <RiSparklingLine className="w-5 h-5 text-orange-500" />
                  來客渠道分佈 (Channel Breakdown)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                {Object.entries(demographics.channelCount).map(([channel, count]) => {
                  const pct = ((count / demographics.totalCust) * 100).toFixed(1)
                  return (
                    <div key={channel} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-bold text-stone-800">
                        <span>{channel}</span>
                        <span className="font-mono text-stone-950">{count} 人 ({pct}%)</span>
                      </div>
                      <Progress value={Number(pct)} indicatorClassName="bg-stone-950" />
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            {/* 📊 客群屬性與運動習慣 */}
            <Card className="border border-stone-200/80 shadow-xs">
              <CardHeader className="border-b border-stone-100 pb-4">
                <CardTitle className="text-base font-bold text-stone-950 flex items-center gap-2">
                  <RiPieChartLine className="w-5 h-5 text-orange-500" />
                  客群屬性與運動習慣分析
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5 pt-4">
                {/* 性別比例 */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-stone-500 block">性別比例</span>
                  <div className="h-4 w-full bg-stone-100 rounded-full overflow-hidden flex font-mono text-[10px] text-white font-bold">
                    <div
                      style={{ width: `${(demographics.genderCount.female / demographics.totalCust) * 100}%` }}
                      className="bg-stone-900 flex items-center justify-center"
                    >
                      女 {((demographics.genderCount.female / demographics.totalCust) * 100).toFixed(0)}%
                    </div>
                    <div
                      style={{ width: `${(demographics.genderCount.male / demographics.totalCust) * 100}%` }}
                      className="bg-orange-500 flex items-center justify-center"
                    >
                      男 {((demographics.genderCount.male / demographics.totalCust) * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>

                {/* 運動習慣 */}
                <div className="space-y-3 pt-2 border-t border-stone-100">
                  <span className="text-xs font-bold text-stone-500 block">運動習慣分佈</span>
                  
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-bold text-stone-700">
                      <span>完全沒運動</span>
                      <span className="font-mono">{demographics.habitCount.none} 人</span>
                    </div>
                    <Progress value={(demographics.habitCount.none / demographics.totalCust) * 100} indicatorClassName="bg-stone-400" />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-bold text-stone-700">
                      <span>每週 1-2 次</span>
                      <span className="font-mono">{demographics.habitCount.weekly_1_2} 人</span>
                    </div>
                    <Progress value={(demographics.habitCount.weekly_1_2 / demographics.totalCust) * 100} indicatorClassName="bg-stone-800" />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-bold text-stone-700">
                      <span>每週 3 次以上</span>
                      <span className="font-mono">{demographics.habitCount.weekly_3_plus} 人</span>
                    </div>
                    <Progress value={(demographics.habitCount.weekly_3_plus / demographics.totalCust) * 100} indicatorClassName="bg-orange-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Section 3: 合約規格 & 教練課耗排行 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 合約規格 */}
            <Card className="border border-stone-200/80 shadow-xs">
              <CardHeader className="border-b border-stone-100 pb-4">
                <CardTitle className="text-base font-bold text-stone-950 flex items-center gap-2">
                  <RiCalendarCheckLine className="w-5 h-5 text-orange-500" />
                  課程購買與合約規格分佈
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3.5 pt-4">
                {Object.entries(contractSpecs.specMap).map(([spec, count]) => {
                  const pct = ((count / contractSpecs.totalCount) * 100).toFixed(1)
                  return (
                    <div key={spec} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-bold text-stone-800">
                        <span>{spec} 方案</span>
                        <span className="font-mono text-stone-950">{count} 份 ({pct}%)</span>
                      </div>
                      <Progress value={Number(pct)} indicatorClassName="bg-stone-900" />
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            {/* 教練課耗與產值排行 */}
            <Card className="border border-stone-200/80 shadow-xs">
              <CardHeader className="border-b border-stone-100 pb-4">
                <CardTitle className="text-base font-bold text-stone-950 flex items-center gap-2">
                  <RiFireLine className="w-5 h-5 text-orange-500" />
                  教練銷課與業績排行榜
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                {trainerPerformance.list.length === 0 ? (
                  <p className="text-stone-400 text-xs py-4 text-center italic">該時段尚無教練銷課紀錄</p>
                ) : (
                  trainerPerformance.list.map((tp, idx) => {
                    const sessionPct = ((tp.sessions / trainerPerformance.maxSessions) * 100).toFixed(0)
                    return (
                      <div key={tp.trainerId} className="p-3 rounded-lg bg-stone-50/70 border border-stone-200/60 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold font-mono ${
                              idx === 0 ? 'bg-orange-500 text-white' : 'bg-stone-900 text-white'
                            }`}>
                              {idx + 1}
                            </span>
                            <span className="text-xs font-bold text-stone-900">{tp.trainerName}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-bold text-stone-700">完成 {tp.sessions} 堂銷課</span>
                            <span className="text-xs font-black font-mono text-stone-950 block">
                              ${tp.revenue.toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <Progress value={Number(sessionPct)} indicatorClassName={idx === 0 ? "bg-orange-500" : "bg-stone-900"} />
                      </div>
                    )
                  })
                )}
              </CardContent>
            </Card>
          </div>

          {/* Section 4: 幽靈會員預警 */}
          <Card className="border border-stone-200/80 shadow-xs">
            <CardHeader className="border-b border-stone-100 pb-4">
              <CardTitle className="text-base font-bold text-stone-950 flex items-center gap-2">
                <RiAlertLine className="w-5 h-5 text-orange-500" />
                幽靈會員預警清單 (超過 30 天未到店且無未來預約)
              </CardTitle>
              <CardDescription className="text-xs text-stone-500">
                共有 <span className="font-bold text-stone-950">{churnAnalysis.inactiveGhostMembers.length}</span> 位學員合約尚在，但長期未到店上課。
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>學員姓名</TableHead>
                    <TableHead>聯絡電話</TableHead>
                    <TableHead>負責教練</TableHead>
                    <TableHead className="text-right">上次到店時間</TableHead>
                    <TableHead className="text-center">狀態</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {churnAnalysis.inactiveGhostMembers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-stone-500 text-xs font-bold">
                        <RiCheckboxCircleLine className="w-5 h-5 text-emerald-500 inline mr-1" />
                        太棒了！目前無任何超過 30 天未到店的幽靈學員
                      </TableCell>
                    </TableRow>
                  ) : (
                    churnAnalysis.inactiveGhostMembers.map(({ customer, lastLessonDate, daysInactive, trainerName }) => (
                      <TableRow key={customer.id}>
                        <TableCell className="font-bold text-stone-900">{customer.name}</TableCell>
                        <TableCell className="font-mono text-xs text-stone-600">{customer.phone}</TableCell>
                        <TableCell className="font-medium text-xs text-stone-700">{trainerName}</TableCell>
                        <TableCell className="text-right font-mono text-xs text-stone-600">
                          {lastLessonDate ? `${daysInactive} 天前` : '未會面過'}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className="bg-orange-50 text-orange-700 border-orange-200/80 font-bold">
                            <RiUserForbidLine className="w-3.5 h-3.5 mr-1" />
                            流失預警
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Section 5: 會員活躍度 RFM 模型 */}
          <Card className="border border-stone-200/80 shadow-xs">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-stone-100 pb-4 gap-3">
              <div>
                <CardTitle className="text-base font-bold text-stone-950 flex items-center gap-2">
                  <RiPulseLine className="w-5 h-5 text-orange-500" />
                  會員活躍度 RFM 模型排行榜
                </CardTitle>
                <CardDescription className="text-xs text-stone-500">
                  R (最近到店) | F (每週平均上課頻率) | M (累計會籍與合約貢獻金額)
                </CardDescription>
              </div>

              {/* Sorting Filter */}
              <div className="flex items-center gap-2 shrink-0">
                <RiFilter3Line className="w-4 h-4 text-stone-400" />
                <span className="text-xs font-bold text-stone-600">排序：</span>
                <select
                  value={rfmSortBy}
                  onChange={(e) => setRfmSortBy(e.target.value as RfmSortKey)}
                  className="border border-stone-200 rounded-lg px-2.5 py-1 text-xs bg-stone-50 font-bold text-stone-800 focus:outline-none focus:ring-1 focus:ring-orange-500 cursor-pointer"
                >
                  <option value="frequency">按上課頻率 (F - 高至低)</option>
                  <option value="monetary">按消費貢獻度 (M - 高至低)</option>
                  <option value="recency">按到店時間 (R - 近至遠)</option>
                </select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 text-center">排名</TableHead>
                    <TableHead>學員姓名</TableHead>
                    <TableHead>聯絡電話</TableHead>
                    <TableHead className="text-right">R (最近到店)</TableHead>
                    <TableHead className="text-right">F (每週頻率)</TableHead>
                    <TableHead className="text-right">M (累計貢獻度)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRfmMembers.slice(0, 15).map((m, idx) => (
                    <TableRow key={m.customer.id}>
                      <TableCell className="text-center font-mono font-bold text-xs">
                        <span className={`w-5 h-5 rounded-full inline-flex items-center justify-center ${
                          idx === 0 ? 'bg-orange-500 text-white' : idx === 1 ? 'bg-stone-900 text-white' : idx === 2 ? 'bg-stone-700 text-white' : 'bg-stone-100 text-stone-600'
                        }`}>
                          {idx + 1}
                        </span>
                      </TableCell>
                      <TableCell className="font-bold text-stone-900">{m.customer.name}</TableCell>
                      <TableCell className="font-mono text-xs text-stone-500">{m.customer.phone}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-stone-700">{m.recencyDays}</TableCell>
                      <TableCell className="text-right font-mono font-bold text-stone-950 text-xs">
                        {m.frequency} 次/週 ({m.totalLessonsCount} 堂)
                      </TableCell>
                      <TableCell className="text-right font-mono font-black text-stone-950 text-xs">
                        ${m.monetary.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

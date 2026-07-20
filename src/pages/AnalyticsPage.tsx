import { useState, useEffect, useMemo } from 'react'
import {
  TrendingUp,
  Users,
  PieChart,
  Calendar,
  AlertTriangle,
  Award,
  ArrowUpRight,
  UserX,
  Activity,
  Flame,
  Filter,
  BarChart3,
  Sparkles,
} from 'lucide-react'
import { StatCard } from '../components/shared/StatCard'
import { useCustomers } from '../hooks/useCustomers'
import { useContracts } from '../hooks/useContracts'
import { useCashFlow } from '../hooks/useCashFlow'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { Customer, CustomerContract, TrialRecord, Trainer } from '../types'
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

  // Fetch trainers, trials, and lessons
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

  // --- Filtered datasets based on selectedYear & selectedMonth ---
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

  // --- 1. 銷售與轉換分析 (Sales & Conversion) ---
  const trialConversionStats = useMemo(() => {
    const total = filteredTrials.length
    const converted = filteredTrials.filter((t) => t.outcome === 'converted').length
    const rate = total > 0 ? ((converted / total) * 100).toFixed(1) : '0.0'

    // Per Trainer Conversion Ranking
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

  // Renewal Rate (續課率)
  const renewalStats = useMemo(() => {
    const renewals = filteredContracts.filter((c) => (c as any).partnerMode === 'renewal' || (c as any).isRenewal).length
    const totalEnded = contracts.filter((c) => c.status === 'completed' || c.status === 'expired').length
    const rate = totalEnded > 0 ? ((renewals / totalEnded) * 100).toFixed(1) : '0.0'
    return { renewals, totalEnded, rate }
  }, [filteredContracts, contracts])

  // --- 2. 客群與漏斗分析 (Demographics & Channels) ---
  const demographics = useMemo(() => {
    const genderCount = { female: 0, male: 0, other: 0 }
    const habitCount = { none: 0, weekly_1_2: 0, weekly_3_plus: 0 }
    const ageCount = { '20歲以下': 0, '20-29歲': 0, '30-39歲': 0, '40-49歲': 0, '50歲以上': 0 }
    const channelCount: Record<string, number> = {
      Instagram: 0,
      Facebook: 0,
      'Google 搜尋': 0,
      '親友/會員介紹': 0,
      '路過/現場親洽': 0,
      其他管道: 0,
    }

    customers.forEach((c) => {
      // Gender
      if (c.gender === 'male') genderCount.male += 1
      else if (c.gender === 'other') genderCount.other += 1
      else genderCount.female += 1

      // Habit
      if (c.exerciseHabit === 'weekly_1_2') habitCount.weekly_1_2 += 1
      else if (c.exerciseHabit === 'weekly_3_plus') habitCount.weekly_3_plus += 1
      else habitCount.none += 1

      // Age Group from dateOfBirth
      if (c.dateOfBirth) {
        const birthDate = c.dateOfBirth.toDate ? c.dateOfBirth.toDate() : new Date(c.dateOfBirth as any)
        const age = new Date().getFullYear() - birthDate.getFullYear()
        if (age < 20) ageCount['20歲以下'] += 1
        else if (age <= 29) ageCount['20-29歲'] += 1
        else if (age <= 39) ageCount['30-39歲'] += 1
        else if (age <= 49) ageCount['40-49歲'] += 1
        else ageCount['50歲以上'] += 1
      } else {
        ageCount['20-29歲'] += 1
      }

      // Channel
      const src = c.source || 'instagram'
      if (src === 'instagram') channelCount.Instagram += 1
      else if (src === 'facebook') channelCount.Facebook += 1
      else if (src === 'google') channelCount['Google 搜尋'] += 1
      else if (src === 'referral') channelCount['親友/會員介紹'] += 1
      else if (src === 'walk_in') channelCount['路過/現場親洽'] += 1
      else channelCount.其他管道 += 1
    })

    const totalCust = customers.length || 1

    return { genderCount, habitCount, ageCount, channelCount, totalCust }
  }, [customers])

  // --- 3. 合約分析 (Contract Specs) ---
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

  // --- 4. 營運與課耗分析 (Monthly 12-Month Lesson Trend Bar Chart) ---
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

    // Filtered lessons for performance
    filteredLessons.forEach((l) => {
      if (l.status === 'completed' && l.trainerId) {
        if (!map[l.trainerId]) map[l.trainerId] = { sessions: 0, revenue: 0 }
        map[l.trainerId].sessions += 1
      }
    })

    // Filtered Cash flow revenue for performance
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
    const maxRevenue = Math.max(...list.map((t) => t.revenue), 1)

    return { list, maxSessions, maxRevenue }
  }, [filteredLessons, filteredCashFlowRecords, trainerMap])

  // --- 5. 會員留存與流失監控 (Ghost Members & Churn) ---
  const churnAnalysis = useMemo(() => {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

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

  // --- 6. 會員活躍度 RFM 模型 (RFM Analysis) ---
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
      {/* Header & Shared Filters */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-stone-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
            <Activity className="w-6 h-6 text-emerald-600" />
            數據分析與營運儀表板
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            即時追蹤銷售轉換率、漏斗結構、銷課趨勢圖表、幽靈學員預警與 RFM 會員排行
          </p>
        </div>

        {/* Year & Month Selection Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="border border-stone-200 rounded-xl px-3 py-2 text-xs bg-stone-50 font-bold text-stone-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-stone-900/10 cursor-pointer"
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
            className="border border-stone-200 rounded-xl px-3 py-2 text-xs bg-stone-50 font-bold text-stone-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-stone-900/10 cursor-pointer"
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
          {/* Top Key Performance Indicators (KPI Cards) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              title={`體驗課成交率 (${monthLabel})`}
              value={`${trialConversionStats.rate}%`}
              icon={TrendingUp}
              iconColor="text-emerald-600"
              iconBg="bg-emerald-50"
              subtitle={`成交 ${trialConversionStats.converted} / 總體驗 ${trialConversionStats.total} 人`}
            />
            <StatCard
              title={`續課率 (${monthLabel})`}
              value={`${renewalStats.rate}%`}
              icon={Award}
              iconColor="text-blue-600"
              iconBg="bg-blue-50"
              subtitle={`續約 ${renewalStats.renewals} / 到期 ${renewalStats.totalEnded} 件`}
            />
            <StatCard
              title="幽靈會員預警 (>30天未到店)"
              value={`${churnAnalysis.inactiveGhostMembers.length} 人`}
              icon={AlertTriangle}
              iconColor="text-amber-600"
              iconBg="bg-amber-50"
              subtitle="有合約但無未來預約紀錄"
            />
            <StatCard
              title="場館學員資料庫"
              value={`${customers.length} 人`}
              icon={Users}
              iconColor="text-purple-600"
              iconBg="bg-purple-50"
              subtitle="總註冊學員數"
            />
          </div>

          {/* 📈 Visualization 1: 每月課堂銷課總表趨勢圖 (12-Month Lesson Trend Bar Chart) */}
          <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-emerald-600" />
                  {selectedYear} 年度銷課總表趨勢圖
                </h3>
                <p className="text-xs text-stone-400 mt-0.5">
                  呈現 1~12 月「實際總銷課堂數」的起伏動態（當前篩選：{monthLabel}）
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-stone-600 bg-stone-100 px-3 py-1 rounded-full border border-stone-200">
                年總銷課: {monthlyLessonsTrend.months.reduce((a, b) => a + b, 0)} 堂
              </span>
            </div>

            {/* 12-Month Bar Chart Container */}
            <div className="pt-6 pb-2 px-2">
              <div className="h-44 flex items-end justify-between gap-2 border-b border-stone-200 pb-2">
                {monthlyLessonsTrend.months.map((count, idx) => {
                  const monthNum = idx + 1
                  const isSelected = selectedMonth === monthNum
                  const heightPct = Math.max(10, (count / monthlyLessonsTrend.maxVal) * 100)

                  return (
                    <div key={monthNum} className="flex-1 flex flex-col items-center gap-2 group h-full justify-end">
                      <span className={`text-[11px] font-mono font-bold transition-all ${isSelected ? 'text-amber-600 font-black' : 'text-stone-500'}`}>
                        {count > 0 ? `${count}堂` : ''}
                      </span>
                      <div
                        className={`w-full rounded-t-lg transition-all duration-300 ${
                          isSelected
                            ? 'bg-gradient-to-t from-amber-500 to-amber-400 shadow-md shadow-amber-200'
                            : 'bg-stone-200 hover:bg-stone-300'
                        }`}
                        style={{ height: `${heightPct}%` }}
                      />
                      <span className={`text-xs font-bold ${isSelected ? 'text-amber-800 font-black' : 'text-stone-600'}`}>
                        {monthNum}月
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Section 2: 渠道轉化漏斗 & 客群結構圖表 (Demographics & Channels Visualizations) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 🎯 渠道轉化漏斗視覺條 (Channel Funnel Visual Progress Bars) */}
            <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-600" />
                來客渠道漏斗分析 (Channel Breakdown)
              </h3>

              <div className="space-y-3 pt-2">
                {Object.entries(demographics.channelCount).map(([channel, count]) => {
                  const pct = ((count / demographics.totalCust) * 100).toFixed(1)
                  return (
                    <div key={channel} className="space-y-1">
                      <div className="flex justify-between text-xs font-bold text-stone-700">
                        <span>{channel}</span>
                        <span className="font-mono text-stone-900">{count} 人 ({pct}%)</span>
                      </div>
                      <div className="h-2.5 w-full bg-stone-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(4, Number(pct))}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 📊 客群結構與運動習慣 (Demographics Progress Bars) */}
            <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
                <PieChart className="w-5 h-5 text-purple-600" />
                客群屬性與運動習慣視覺化
              </h3>

              <div className="space-y-4 pt-2">
                {/* 性別比例條 */}
                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-stone-500 block">性別比例</span>
                  <div className="h-4 w-full bg-stone-100 rounded-full overflow-hidden flex font-mono text-[10px] text-white font-bold">
                    <div
                      style={{ width: `${(demographics.genderCount.female / demographics.totalCust) * 100}%` }}
                      className="bg-pink-500 flex items-center justify-center"
                    >
                      女 {((demographics.genderCount.female / demographics.totalCust) * 100).toFixed(0)}%
                    </div>
                    <div
                      style={{ width: `${(demographics.genderCount.male / demographics.totalCust) * 100}%` }}
                      className="bg-blue-500 flex items-center justify-center"
                    >
                      男 {((demographics.genderCount.male / demographics.totalCust) * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>

                {/* 運動習慣進度條 */}
                <div className="space-y-2 pt-2 border-t border-stone-100">
                  <span className="text-xs font-bold text-stone-500 block">運動習慣分佈</span>
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-red-600 font-bold">完全沒運動</span>
                        <span className="font-mono font-bold">{demographics.habitCount.none} 人</span>
                      </div>
                      <div className="h-2 w-full bg-stone-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-red-400 rounded-full"
                          style={{ width: `${(demographics.habitCount.none / demographics.totalCust) * 100}%` }}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-emerald-600 font-bold">每週 1-2 次</span>
                        <span className="font-mono font-bold">{demographics.habitCount.weekly_1_2} 人</span>
                      </div>
                      <div className="h-2 w-full bg-stone-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${(demographics.habitCount.weekly_1_2 / demographics.totalCust) * 100}%` }}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-purple-600 font-bold">每週 3 次以上</span>
                        <span className="font-mono font-bold">{demographics.habitCount.weekly_3_plus} 人</span>
                      </div>
                      <div className="h-2 w-full bg-stone-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-purple-500 rounded-full"
                          style={{ width: `${(demographics.habitCount.weekly_3_plus / demographics.totalCust) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: 合約規格分佈 & 教練課耗與產值排行圖表 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 合約方案規格分佈視覺圖 */}
            <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-purple-600" />
                課程購買與合約規格分佈
              </h3>
              <div className="space-y-3 pt-2">
                {Object.entries(contractSpecs.specMap).map(([spec, count]) => {
                  const pct = ((count / contractSpecs.totalCount) * 100).toFixed(1)
                  return (
                    <div key={spec} className="space-y-1">
                      <div className="flex justify-between text-xs font-bold text-stone-800">
                        <span>{spec} 方案</span>
                        <span className="font-mono text-purple-900">{count} 份 ({pct}%)</span>
                      </div>
                      <div className="h-2.5 w-full bg-purple-50 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
                          style={{ width: `${Math.max(4, Number(pct))}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 教練銷課與產值排行視覺圖 */}
            <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
                <Flame className="w-5 h-5 text-orange-500" />
                教練銷課課耗與產值排行榜
              </h3>
              <div className="space-y-3">
                {trainerPerformance.list.length === 0 ? (
                  <p className="text-stone-400 text-xs py-4 text-center">該時段尚無教練銷課數據</p>
                ) : (
                  trainerPerformance.list.map((tp, idx) => {
                    const sessionPct = ((tp.sessions / trainerPerformance.maxSessions) * 100).toFixed(0)
                    return (
                      <div key={tp.trainerId} className="p-3 rounded-xl bg-stone-50 border border-stone-100 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                              idx === 0 ? 'bg-amber-400 text-stone-900' : idx === 1 ? 'bg-stone-300 text-stone-900' : 'bg-amber-700/20 text-amber-900'
                            }`}>
                              {idx + 1}
                            </span>
                            <span className="text-sm font-bold text-stone-900">{tp.trainerName}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-bold text-stone-700">完成 {tp.sessions} 堂銷課</span>
                            <span className="text-xs font-black font-mono text-emerald-600 block">
                              ${tp.revenue.toLocaleString()} 業績
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 w-full bg-stone-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-orange-400 to-amber-500 rounded-full"
                            style={{ width: `${Math.max(5, Number(sessionPct))}%` }}
                          />
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>

          {/* Section 4: 幽靈會員預警 (Inactive Ghost Members) */}
          <div className="bg-white border-2 border-amber-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-amber-900 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  幽靈會員預警清單 (超過 30 天未到店且無未來預約)
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  共有 <span className="font-bold text-amber-700">{churnAnalysis.inactiveGhostMembers.length}</span> 位學員合約尚在，但長期未到店，建議教練主動關懷！
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-amber-50/80 text-amber-950 border-b border-amber-200">
                  <tr>
                    <th className="px-4 py-3 font-bold text-xs uppercase">學員姓名</th>
                    <th className="px-4 py-3 font-bold text-xs uppercase">聯絡電話</th>
                    <th className="px-4 py-3 font-bold text-xs uppercase">負責教練</th>
                    <th className="px-4 py-3 font-bold text-xs uppercase text-right">上次到店時間</th>
                    <th className="px-4 py-3 font-bold text-xs uppercase text-center">狀態</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {churnAnalysis.inactiveGhostMembers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-stone-400 text-xs">
                        🎉 太棒了！目前無任何超過 30 天未到店的幽靈學員
                      </td>
                    </tr>
                  ) : (
                    churnAnalysis.inactiveGhostMembers.map(({ customer, lastLessonDate, daysInactive, trainerName }) => (
                      <tr key={customer.id} className="hover:bg-amber-50/30 transition-colors">
                        <td className="px-4 py-3 font-bold text-stone-900">{customer.name}</td>
                        <td className="px-4 py-3 text-stone-600 font-mono text-xs">{customer.phone}</td>
                        <td className="px-4 py-3 text-stone-700 font-medium text-xs">{trainerName}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-stone-500">
                          {lastLessonDate ? `${daysInactive} 天前` : '未會面過'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            <UserX className="w-3 h-3" />
                            流失預警
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 5: 會員活躍度 RFM 模型 (RFM Ranking) */}
          <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-emerald-600" />
                  會員活躍度 RFM 模型排行榜
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  R (最近到店) | F (每週平均上課頻率) | M (累計會籍與合約貢獻金額)
                </p>
              </div>

              {/* Sorting Filter */}
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-stone-400" />
                <span className="text-xs font-bold text-stone-600">排序依據：</span>
                <select
                  value={rfmSortBy}
                  onChange={(e) => setRfmSortBy(e.target.value as RfmSortKey)}
                  className="border border-stone-200 rounded-xl px-3 py-1.5 text-xs bg-stone-50 font-bold text-stone-800 focus:outline-none cursor-pointer"
                >
                  <option value="frequency">按上課頻率 (F - 高至低)</option>
                  <option value="monetary">按消費貢獻度 (M - 高至低)</option>
                  <option value="recency">按到店時間 (R - 近至遠)</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-stone-50 text-stone-600 border-b border-stone-200">
                  <tr>
                    <th className="px-4 py-3 font-bold text-xs uppercase w-12 text-center">排名</th>
                    <th className="px-4 py-3 font-bold text-xs uppercase">學員姓名</th>
                    <th className="px-4 py-3 font-bold text-xs uppercase">聯絡電話</th>
                    <th className="px-4 py-3 font-bold text-xs uppercase text-right">R (最近到店)</th>
                    <th className="px-4 py-3 font-bold text-xs uppercase text-right">F (每週頻率)</th>
                    <th className="px-4 py-3 font-bold text-xs uppercase text-right">M (累計貢獻度)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {sortedRfmMembers.slice(0, 15).map((m, idx) => (
                    <tr key={m.customer.id} className="hover:bg-stone-50 transition-colors">
                      <td className="px-4 py-3 text-center">
                        <span className={`w-6 h-6 rounded-full inline-flex items-center justify-center text-xs font-bold ${
                          idx === 0 ? 'bg-amber-400 text-stone-900' : idx === 1 ? 'bg-stone-300 text-stone-900' : idx === 2 ? 'bg-amber-700/20 text-amber-900' : 'bg-stone-100 text-stone-500'
                        }`}>
                          {idx + 1}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-stone-900">{m.customer.name}</td>
                      <td className="px-4 py-3 text-stone-500 font-mono text-xs">{m.customer.phone}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-stone-700">{m.recencyDays}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600 text-xs">
                        {m.frequency} 次/週 ({m.totalLessonsCount} 堂)
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-black text-stone-900 text-xs">
                        ${m.monetary.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

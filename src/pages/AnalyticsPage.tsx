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
  CheckCircle2,
  Filter,
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
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear())

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

  const trainerMap = useMemo(() => {
    const map: Record<string, string> = {}
    trainers.forEach((t) => {
      map[t.id] = t.name
    })
    return map
  }, [trainers])

  // --- 1. 銷售與轉換分析 (Sales & Conversion) ---
  const trialConversionStats = useMemo(() => {
    const total = trials.length
    const converted = trials.filter((t) => t.outcome === 'converted').length
    const rate = total > 0 ? ((converted / total) * 100).toFixed(1) : '0.0'

    // Per Trainer Conversion Ranking
    const trainerTrialMap: Record<string, { total: number; converted: number }> = {}
    trials.forEach((t) => {
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
  }, [trials, trainerMap])

  // Renewal Rate (續課率)
  const renewalStats = useMemo(() => {
    const renewals = contracts.filter((c) => (c as any).partnerMode === 'renewal' || (c as any).isRenewal).length
    const totalEnded = contracts.filter((c) => c.status === 'completed' || c.status === 'expired').length
    const rate = totalEnded > 0 ? ((renewals / totalEnded) * 100).toFixed(1) : '0.0'
    return { renewals, totalEnded, rate }
  }, [contracts])

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

    return { genderCount, habitCount, ageCount, channelCount }
  }, [customers])

  // --- 3. 合約分析 (Contract Specs & Ratio) ---
  const contractSpecs = useMemo(() => {
    const specMap: Record<string, number> = {
      '10堂': 0,
      '24堂': 0,
      '36堂': 0,
      '48堂': 0,
      '72堂': 0,
      其他規格: 0,
    }

    contracts.forEach((c) => {
      const s = c.totalSessions
      if (s === 10) specMap['10堂'] += 1
      else if (s === 24) specMap['24堂'] += 1
      else if (s === 36) specMap['36堂'] += 1
      else if (s === 48) specMap['48堂'] += 1
      else if (s === 72) specMap['72堂'] += 1
      else specMap.其他規格 += 1
    })

    return specMap
  }, [contracts])

  // --- 4. 營運與課耗分析 (Operations & Lesson Consumption) ---
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
    return months
  }, [lessons, selectedYear])

  // Trainer Consumption & Revenue Ranking
  const trainerPerformance = useMemo(() => {
    const map: Record<string, { sessions: number; revenue: number }> = {}

    // Lessons completed
    lessons.forEach((l) => {
      if (l.status === 'completed' && l.trainerId) {
        if (!map[l.trainerId]) map[l.trainerId] = { sessions: 0, revenue: 0 }
        map[l.trainerId].sessions += 1
      }
    })

    // Cash flow revenue
    cashFlowRecords.map(normalizeCashFlowRecord).forEach((r) => {
      if (r.type === 'income' && r.trainerId) {
        if (!map[r.trainerId]) map[r.trainerId] = { sessions: 0, revenue: 0 }
        map[r.trainerId].revenue += r.amount || 0
      }
    })

    return Object.entries(map)
      .map(([trainerId, data]) => ({
        trainerId,
        trainerName: trainerMap[trainerId] || '未指定教練',
        sessions: data.sessions,
        revenue: data.revenue,
      }))
      .sort((a, b) => b.sessions - a.sessions)
  }, [lessons, cashFlowRecords, trainerMap])

  // --- 5. 會員留存與流失監控 (Ghost Members & Churn) ---
  const churnAnalysis = useMemo(() => {
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const inactiveGhostMembers: Array<{
      customer: Customer
      lastLessonDate: Date | null
      daysInactive: number
      trainerName: string
    }> = []

    const confirmedChurnMembers: Customer[] = []

    customers.forEach((cust) => {
      const custContracts = contracts.filter((c) => c.customerId === cust.id || c.sharedWithCustomerId === cust.id)
      const hasActiveContract = custContracts.some((c) => c.status === 'active' || c.status === 'expiring')

      // Customer's completed lessons
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

      if (!hasActiveContract && custContracts.length > 0) {
        confirmedChurnMembers.push(cust)
      }
    })

    return {
      inactiveGhostMembers: inactiveGhostMembers.sort((a, b) => b.daysInactive - a.daysInactive),
      confirmedChurnMembers,
    }
  }, [customers, contracts, lessons, trainerMap])

  // --- 6. 會員活躍度 RFM 模型 (RFM Analysis) ---
  const rfmMembers = useMemo(() => {
    const now = new Date()

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

      // Frequency = Total lessons / 4 weeks (average weekly attendance rate)
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
            <Activity className="w-6 h-6 text-brand-600" />
            數據分析與營 universal 儀表板
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            即時監控轉換率、漏斗結構、銷課產值、幽靈流失警示與 RFM 會員活躍度
          </p>
        </div>

        {/* Year Filter */}
        <div className="flex items-center gap-2">
          <select
            className="border border-stone-200 rounded-xl px-3 py-2 text-xs bg-white font-bold text-stone-700 shadow-sm focus:outline-none cursor-pointer"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
          >
            {[0, 1, 2].map((offset) => {
              const y = new Date().getFullYear() - offset
              return (
                <option key={y} value={y}>
                  {y} 年度數據
                </option>
              )
            })}
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
              title="體驗課成交率"
              value={`${trialConversionStats.rate}%`}
              icon={TrendingUp}
              iconColor="text-emerald-600"
              iconBg="bg-emerald-50"
              subtitle={`成交 ${trialConversionStats.converted} / 總體驗 ${trialConversionStats.total} 人`}
            />
            <StatCard
              title="續課率 (Renewal Rate)"
              value={`${renewalStats.rate}%`}
              icon={Award}
              iconColor="text-blue-600"
              iconBg="bg-blue-50"
              subtitle={`續約 ${renewalStats.renewals} / 到期合約 ${renewalStats.totalEnded} 件`}
            />
            <StatCard
              title="幽靈會員預警 (>30天未到店)"
              value={`${churnAnalysis.inactiveGhostMembers.length} 人`}
              icon={AlertTriangle}
              iconColor="text-amber-600"
              iconBg="bg-amber-50"
              subtitle="有有效合約但無未來預約"
            />
            <StatCard
              title="活躍學員數"
              value={`${customers.length} 人`}
              icon={Users}
              iconColor="text-purple-600"
              iconBg="bg-purple-50"
              subtitle="場館資料庫總學員數"
            />
          </div>

          {/* Section 1: Sales & Conversion + Demographics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 教練體驗課成交率排行 */}
            <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-500" />
                  教練體驗成交率排行榜
                </h3>
                <span className="text-xs text-stone-400 font-medium">按轉換率排序</span>
              </div>
              <div className="space-y-3">
                {trialConversionStats.trainerRanking.length === 0 ? (
                  <p className="text-stone-400 text-xs py-4 text-center">尚無教練體驗課轉換數據</p>
                ) : (
                  trialConversionStats.trainerRanking.map((t, idx) => (
                    <div key={t.trainerId} className="flex items-center justify-between p-3 rounded-xl bg-stone-50 border border-stone-100">
                      <div className="flex items-center gap-3">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          idx === 0 ? 'bg-amber-400 text-stone-900' : idx === 1 ? 'bg-stone-300 text-stone-900' : 'bg-amber-700/20 text-amber-900'
                        }`}>
                          {idx + 1}
                        </span>
                        <div>
                          <p className="text-sm font-bold text-stone-800">{t.trainerName}</p>
                          <p className="text-xs text-stone-500">成交 {t.converted} / 帶體驗 {t.total} 人</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-base font-black font-mono text-emerald-600">
                          {t.rate.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 客群結構分佈 (Demographics) */}
            <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
                <PieChart className="w-5 h-5 text-blue-500" />
                客群結構與運動習慣分析
              </h3>

              <div className="grid grid-cols-2 gap-4 pt-2">
                {/* 性別比例 */}
                <div className="p-4 bg-stone-50 rounded-xl border border-stone-100 space-y-2">
                  <span className="text-xs font-bold text-stone-500">性別比例</span>
                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-pink-600 font-bold">女性</span>
                      <span className="font-mono font-bold">{demographics.genderCount.female} 人</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-blue-600 font-bold">男性</span>
                      <span className="font-mono font-bold">{demographics.genderCount.male} 人</span>
                    </div>
                  </div>
                </div>

                {/* 運動習慣 */}
                <div className="p-4 bg-stone-50 rounded-xl border border-stone-100 space-y-2">
                  <span className="text-xs font-bold text-stone-500">運動習慣</span>
                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-red-500 font-bold">完全沒運動</span>
                      <span className="font-mono font-bold">{demographics.habitCount.none} 人</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-emerald-600 font-bold">每週 1-2 次</span>
                      <span className="font-mono font-bold">{demographics.habitCount.weekly_1_2} 人</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-purple-600 font-bold">每週 3 次以上</span>
                      <span className="font-mono font-bold">{demographics.habitCount.weekly_3_plus} 人</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 渠道漏斗 */}
              <div className="p-4 bg-stone-50 rounded-xl border border-stone-100 space-y-2">
                <span className="text-xs font-bold text-stone-500 block mb-2">來客渠道分佈 (Channel Funnel)</span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {Object.entries(demographics.channelCount).map(([channel, count]) => (
                    <div key={channel} className="bg-white p-2.5 rounded-lg border border-stone-200/60 flex items-center justify-between text-xs">
                      <span className="text-stone-600 font-medium">{channel}</span>
                      <span className="font-bold font-mono text-stone-900">{count} 人</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: 合約規格分佈 & 每月銷課趨勢 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 合約方案規格分佈 */}
            <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-purple-500" />
                課程購買與合約規格分佈
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                {Object.entries(contractSpecs).map(([spec, count]) => (
                  <div key={spec} className="p-4 bg-purple-50/50 border border-purple-100 rounded-xl space-y-1">
                    <span className="text-xs font-bold text-purple-700 block">{spec} 方案</span>
                    <span className="text-xl font-black font-mono text-purple-950">{count} 份</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 教練銷課與產值排行 */}
            <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
                <Flame className="w-5 h-5 text-orange-500" />
                教練課耗與產值排行榜
              </h3>
              <div className="space-y-3">
                {trainerPerformance.length === 0 ? (
                  <p className="text-stone-400 text-xs py-4 text-center">尚無教練銷課與產值數據</p>
                ) : (
                  trainerPerformance.map((tp, idx) => (
                    <div key={tp.trainerId} className="flex items-center justify-between p-3 rounded-xl bg-stone-50 border border-stone-100">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-stone-200 text-stone-800 flex items-center justify-center text-xs font-bold">
                          {idx + 1}
                        </span>
                        <div>
                          <p className="text-sm font-bold text-stone-900">{tp.trainerName}</p>
                          <p className="text-xs text-stone-500">完成銷課 {tp.sessions} 堂</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-black font-mono text-emerald-600 block">
                          ${tp.revenue.toLocaleString()}
                        </span>
                        <span className="text-[10px] text-stone-400">總業績產值</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Section 3: 幽靈會員預警 (Inactive Ghost Members) */}
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

          {/* Section 4: 會員活躍度 RFM 模型 (RFM Ranking) */}
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

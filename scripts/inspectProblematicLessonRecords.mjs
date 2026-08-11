import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

initializeApp({
  credential: applicationDefault(),
  projectId: 'r27-app-7c5bc',
})

const db = getFirestore()

async function inspectRecords() {
  console.log('Fetching all contracts...')
  const contractsSnap = await db.collection('contracts').get()
  const contractMap = new Map()
  contractsSnap.docs.forEach(d => contractMap.set(d.id, { id: d.id, ...d.data() }))
  console.log(`Loaded ${contractMap.size} contracts.`)

  console.log('Fetching all customers...')
  const customersSnap = await db.collection('customers').get()
  const customerMap = new Map()
  customersSnap.docs.forEach(d => customerMap.set(d.id, { id: d.id, ...d.data() }))
  console.log(`Loaded ${customerMap.size} customers.`)

  console.log('Fetching all lesson records...')
  const recordsSnap = await db.collection('lessonRecords').get()
  console.log(`Loaded ${recordsSnap.docs.length} lesson records.`)

  const problematicRecords = []

  recordsSnap.docs.forEach(docSnap => {
    const r = { id: docSnap.id, ...docSnap.data() }
    const dateStr = r.sessionDate ? new Date(r.sessionDate._seconds * 1000).toISOString().split('T')[0] : '無日期'
    const customerName = r.attendingCustomerNames?.join('、') || r.customerName || '未知學員'

    // Check main contract
    const mainContract = r.contractId ? contractMap.get(r.contractId) : null

    // Check deductions contracts
    const deductionContracts = []
    let hasMissingDeductionContract = false
    if (Array.isArray(r.deductions)) {
      r.deductions.forEach((d, idx) => {
        const c = d.contractId ? contractMap.get(d.contractId) : null
        if (d.contractId && !c) {
          hasMissingDeductionContract = true
        }
        deductionContracts.push({
          idx,
          customerId: d.customerId,
          customerName: d.customerName,
          contractId: d.contractId,
          contractExists: !!c,
          contractType: c?.contractType
        })
      })
    }

    const isContractMissing = !mainContract
    const isRecognizedAmountMissing = r.recognizedAmount === undefined || r.recognizedAmount === null || isNaN(r.recognizedAmount) || r.recognizedAmount === 0

    if (isContractMissing || isRecognizedAmountMissing || hasMissingDeductionContract) {
      problematicRecords.push({
        id: r.id,
        date: dateStr,
        customerName,
        customerId: r.customerId,
        attendingCustomerIds: r.attendingCustomerIds,
        trainerId: r.trainerId,
        sessionAmount: r.sessionAmount,
        recognizedAmount: r.recognizedAmount,
        unitPriceAtDeduction: r.unitPriceAtDeduction,
        contractId: r.contractId,
        mainContractExists: !!mainContract,
        mainContractType: mainContract?.contractType,
        hasMissingDeductionContract,
        deductions: deductionContracts,
        raw: r
      })
    }
  })

  console.log(`\n==========================================`)
  console.log(`掃描完成！共發現 ${problematicRecords.length} 筆問題/合約資訊不明的銷課紀錄`)
  console.log(`==========================================\n`)

  problematicRecords.forEach((item, index) => {
    console.log(`[${index + 1}] 銷課 ID: ${item.id}`)
    console.log(`    日期: ${item.date}`)
    console.log(`    學員: ${item.customerName} (ID: ${item.customerId})`)
    console.log(`    堂數: ${item.sessionAmount}堂`)
    console.log(`    認列金額: ${item.recognizedAmount ?? '未設定/無'} (單價: ${item.unitPriceAtDeduction ?? '無'})`)
    console.log(`    主要合約: ${item.contractId ?? '無'} ${item.mainContractExists ? `(類型: ${item.mainContractType})` : '❌(不存在/無)'}`)
    if (item.deductions.length > 0) {
      console.log(`    扣堂明細 (${item.deductions.length} 筆):`)
      item.deductions.forEach(d => {
        console.log(`      - 明細 ${d.idx+1}: ${d.customerName} (合約 ${d.contractId || '無'} ${d.contractExists ? `[${d.contractType}]` : '❌不存在'})`)
      })
    }
    console.log('------------------------------------------')
  })

  return problematicRecords
}

inspectRecords().catch(console.error)

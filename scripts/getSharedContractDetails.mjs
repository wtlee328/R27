import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

initializeApp({
  credential: applicationDefault(),
  projectId: 'r27-app-7c5bc',
})

const db = getFirestore()

async function getDetails() {
  const ids = [
    { custId: 'gyWKENwGSkyc4qvwCa4x', contractNo: '115081118', oldTrainer: '陳冠瑋', newTrainer: '金羽' },
    { custId: 'iz7tuMSKfixoHsUqR5Ki', contractNo: '115081129', oldTrainer: '未指定 / 無', newTrainer: '金羽' },
    { custId: 'nBTtaIP1HYdRAcsI6fKw', contractNo: '115081129', oldTrainer: '林伯瞬', newTrainer: '簡辰晏' },
    { custId: 'cnxQ3oCaPyPX0TlBb1D4', contractNo: '115081102', oldTrainer: '郭沛霖', newTrainer: '陳冠瑋' },
    { custId: 'U1IwUesjIzz2HGqXL0GY', contractNo: '115081126', oldTrainer: '未指定 / 無', newTrainer: '簡辰晏' },
  ]

  for (const item of ids) {
    const custSnap = await db.collection('customers').doc(item.custId).get()
    const data = custSnap.data()
    console.log(`學員 ID: ${item.custId} | 姓名: ${data?.name || '未知'} | 合約編號: ${item.contractNo} | 校正前教練: ${item.oldTrainer} → 校正後教練: ${item.newTrainer}`)
  }
}

getDetails().catch(console.error)

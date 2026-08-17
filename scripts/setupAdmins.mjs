import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

initializeApp({
  credential: applicationDefault(),
  projectId: 'r27-app-7c5bc',
})

const db = getFirestore()
const auth = getAuth()

const ADMIN_ACCOUNTS = [
  {
    email: 'wtlee328@gmail.com',
    displayName: 'wtlee328@gmail.com',
    isSuperAdmin: true,
  },
  {
    email: 'lins92142t@gmail.com',
    displayName: 'lins92142t@gmail.com',
    isSuperAdmin: false,
  },
]

async function setupAdmins() {
  const targetPassword = process.argv[2]
  console.log('=== 開始設置系統管理員帳號 ===\n')

  for (const admin of ADMIN_ACCOUNTS) {
    try {
      console.log(`處理管理員: ${admin.email}...`)
      let userRecord
      try {
        userRecord = await auth.getUserByEmail(admin.email)
      } catch (err) {
        if (err.code === 'auth/user-not-found') {
          console.log(`  - 帳號不存在，正在建立 Firebase Auth 帳號...`)
          userRecord = await auth.createUser({
            email: admin.email,
            displayName: admin.displayName,
            emailVerified: true,
            password: targetPassword || 'R27Admin2026!',
          })
        } else {
          throw err
        }
      }

      // 1. 設定 Firebase Auth Custom Claims
      await auth.setCustomUserClaims(userRecord.uid, {
        role: 'admin',
        admin: true,
        isSuperAdmin: admin.isSuperAdmin,
      })
      console.log(`  ✓ Firebase Auth Custom Claims 設定成功 (role: admin)`)

      // 2. 若提供密碼參數，同步更新密碼
      if (targetPassword) {
        await auth.updateUser(userRecord.uid, {
          password: targetPassword,
        })
        console.log(`  ✓ 密碼已成功更新`)
      }

      // 3. 同步更新 Firestore users 集合文件
      const userDocRef = db.collection('users').doc(userRecord.uid)
      const userDocSnap = await userDocRef.get()

      const userData = {
        email: admin.email,
        displayName: admin.displayName,
        role: 'admin',
        centerId: 'r27',
        isSuperAdmin: admin.isSuperAdmin,
        updatedAt: FieldValue.serverTimestamp(),
      }

      if (!userDocSnap.exists) {
        await userDocRef.set({
          ...userData,
          createdAt: FieldValue.serverTimestamp(),
        })
        console.log(`  ✓ Firestore /users/${userRecord.uid} 新建成功`)
      } else {
        await userDocRef.update(userData)
        console.log(`  ✓ Firestore /users/${userRecord.uid} 更新成功 (role: admin)`)
      }

      console.log(`  UID: ${userRecord.uid}\n`)
    } catch (err) {
      console.error(`  ✗ 設定 ${admin.email} 失敗:`, err)
    }
  }

  console.log('=== 管理員設定完成 ===')
}

setupAdmins().catch(console.error)

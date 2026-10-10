import * as admin from 'firebase-admin';

// 서비스 계정 키 파일 또는 기본 인증(ADC)을 통해 실행됩니다.
if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * 특정 사용자 UID에 Firebase Auth Custom Claims (admin: true) 부여 스크립트
 * 
 * 실행 방법:
 * 1. Firebase 콘솔 -> 프로젝트 설정 -> 서비스 계정 -> '새 비공개 키 생성' 후 serviceAccountKey.json 다운로드
 * 2. GOOGLE_APPLICATION_CREDENTIALS 환경 변수에 키 경로 지정 또는 아래 initializeApp({ credential: admin.credential.cert(serviceAccount) }) 설정
 * 3. npx ts-node setAdminClaim.ts <TARGET_USER_UID>
 */
async function grantAdmin(uid: string) {
  if (!uid) {
    console.error('사용법: npx ts-node setAdminClaim.ts <UID>');
    process.exit(1);
  }

  try {
    const user = await admin.auth().getUser(uid);
    console.log(`대상 유저 확인: ${user.email || user.displayName || user.uid}`);

    // Custom Claims 설정
    await admin.auth().setCustomUserClaims(uid, {
      ...user.customClaims,
      admin: true
    });

    console.log(`✅ [성공] 사용자 (${uid})에게 admin: true 권한이 성공적으로 부여되었습니다.`);
    console.log('참고: 클라이언트 앱에서는 토큰 갱신(getIdToken(true)) 또는 재로그인 후 관리자 권한이 즉시 반영됩니다.');
  } catch (error) {
    console.error('❌ [실패] 관리자 권한 부여 중 오류 발생:', error);
  }
}

const targetUid = process.argv[2];
grantAdmin(targetUid);

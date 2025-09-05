const Service = require('node-windows').Service;
const path = require('path');

// 서비스 생성
const svc = new Service({
  name: 'KakaoSlackBot',
  description: '카카오톡 플러스친구 프로필을 슬랙으로 전송하는 봇',
  script: path.join(__dirname, 'src', 'index.js'),
  nodeOptions: [
    '--harmony',
    '--max_old_space_size=4096'
  ],
  workingDirectory: __dirname,
  allowServiceLogon: true
});

// 서비스 설치 이벤트
svc.on('install', function() {
  console.log('✅ 서비스가 성공적으로 설치되었습니다!');
  console.log('서비스명: KakaoSlackBot');
  console.log('');
  console.log('서비스 관리:');
  console.log('- 시작: net start KakaoSlackBot');
  console.log('- 중지: net stop KakaoSlackBot');
  console.log('- 제거: node uninstall-service.js');
  console.log('');
  console.log('서비스를 시작합니다...');
  svc.start();
});

svc.on('start', function() {
  console.log('✅ 서비스가 시작되었습니다!');
  console.log('이제 컴퓨터가 재시작되어도 자동으로 실행됩니다.');
});

svc.on('error', function(err) {
  console.log('❌ 서비스 설치 실패:', err);
});

// 서비스 설치
console.log('Windows 서비스로 설치 중...');
svc.install();
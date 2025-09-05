const Service = require('node-windows').Service;
const path = require('path');

// 서비스 생성 (설치할 때와 동일한 설정)
const svc = new Service({
  name: 'KakaoSlackBot',
  script: path.join(__dirname, 'src', 'index.js')
});

// 서비스 제거 이벤트
svc.on('uninstall', function() {
  console.log('✅ 서비스가 성공적으로 제거되었습니다.');
});

svc.on('error', function(err) {
  console.log('❌ 서비스 제거 실패:', err);
});

// 서비스 제거
console.log('Windows 서비스를 제거하는 중...');
svc.uninstall();
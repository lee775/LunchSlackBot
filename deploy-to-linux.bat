@echo off
chcp 65001 > nul
REM KakaoTalk-Slack Bot Linux 배포 스크립트
REM Windows에서 실행하여 Linux 서버에 자동 배포

echo ========================================
echo KakaoTalk-Slack Bot Linux 배포 도구
echo ========================================
echo.

REM 설정 변수 (필요에 따라 수정)
set PEM_KEY=C:\WOOK\lightsail\LightsailDefaultKey-ap-northeast-2.pem
set PROJECT_DIR=%~dp0
set TEMP_TAR=%TEMP%\kakao-slack-bot.tar.gz

REM PEM 키 파일 확인
if not exist "%PEM_KEY%" (
    echo [ERROR] PEM 키 파일을 찾을 수 없습니다: %PEM_KEY%
    echo 파일 경로를 확인하세요.
    pause
    exit /b 1
)

REM 서버 정보 입력
set /p SERVER_IP="서버 IP 주소를 입력하세요 (예: 13.125.xxx.xxx): "
if "%SERVER_IP%"=="" (
    echo [ERROR] IP 주소가 입력되지 않았습니다.
    pause
    exit /b 1
)

set /p SERVER_USER="서버 사용자명을 입력하세요 (기본값: ubuntu): "
if "%SERVER_USER%"=="" set SERVER_USER=ubuntu

set /p REMOTE_PATH="배포 경로를 입력하세요 (기본값: /home/%SERVER_USER%/kakao-slack-bot): "
if "%REMOTE_PATH%"=="" set REMOTE_PATH=/home/%SERVER_USER%/kakao-slack-bot

echo.
echo [INFO] 배포 설정:
echo   - 서버: %SERVER_USER%@%SERVER_IP%
echo   - 경로: %REMOTE_PATH%
echo   - PEM 키: %PEM_KEY%
echo.

REM 사용자 확인
set /p CONFIRM="계속 진행하시겠습니까? (Y/N): "
if /i not "%CONFIRM%"=="Y" (
    echo 배포가 취소되었습니다.
    pause
    exit /b 0
)

echo.
echo [1/7] Git Bash 확인 중...

REM Git Bash 경로 찾기
set GIT_BASH=
if exist "C:\Program Files\Git\bin\bash.exe" (
    set GIT_BASH=C:\Program Files\Git\bin\bash.exe
) else if exist "C:\Program Files (x86)\Git\bin\bash.exe" (
    set GIT_BASH=C:\Program Files (x86)\Git\bin\bash.exe
)

if "%GIT_BASH%"=="" (
    echo [ERROR] Git Bash를 찾을 수 없습니다.
    echo Git for Windows를 설치하세요: https://git-scm.com/download/win
    pause
    exit /b 1
)

echo [OK] Git Bash 발견: %GIT_BASH%

echo.
echo [2/7] SSH 연결 테스트 중...

REM SSH 연결 테스트
"%GIT_BASH%" -c "ssh -i '%PEM_KEY%' -o StrictHostKeyChecking=no -o ConnectTimeout=5 %SERVER_USER%@%SERVER_IP% 'echo OK' 2>&1" | findstr /C:"OK" > nul
if errorlevel 1 (
    echo [ERROR] SSH 연결 실패. 서버 정보와 PEM 키를 확인하세요.
    pause
    exit /b 1
)

echo [OK] SSH 연결 성공

echo.
echo [3/7] 프로젝트 파일 압축 중...

REM 이전 압축 파일 삭제
if exist "%TEMP_TAR%" del /f /q "%TEMP_TAR%"

REM tar로 압축 (node_modules, logs, .git, .env 제외)
cd /d "%PROJECT_DIR%"
"%GIT_BASH%" -c "tar --exclude='node_modules' --exclude='logs' --exclude='.git' --exclude='.env' --exclude='*.tar.gz' -czf '%TEMP_TAR%' ." 2>&1
if errorlevel 1 (
    echo [ERROR] 파일 압축 실패
    pause
    exit /b 1
)

echo [OK] 압축 완료: %TEMP_TAR%

echo.
echo [4/7] 원격 디렉토리 생성 중...

REM 원격 디렉토리 생성
"%GIT_BASH%" -c "ssh -i '%PEM_KEY%' %SERVER_USER%@%SERVER_IP% 'mkdir -p %REMOTE_PATH%'" 2>&1
if errorlevel 1 (
    echo [ERROR] 원격 디렉토리 생성 실패
    pause
    exit /b 1
)

echo [OK] 원격 디렉토리 준비됨

echo.
echo [5/7] 파일 전송 중... (시간이 걸릴 수 있습니다)

REM SCP로 파일 전송
"%GIT_BASH%" -c "scp -i '%PEM_KEY%' '%TEMP_TAR%' %SERVER_USER%@%SERVER_IP%:%REMOTE_PATH%/kakao-slack-bot.tar.gz" 2>&1
if errorlevel 1 (
    echo [ERROR] 파일 전송 실패
    pause
    exit /b 1
)

echo [OK] 파일 전송 완료

echo.
echo [6/7] 원격 서버에서 압축 해제 중...

REM 원격 서버에서 압축 해제
"%GIT_BASH%" -c "ssh -i '%PEM_KEY%' %SERVER_USER%@%SERVER_IP% 'cd %REMOTE_PATH% && tar -xzf kakao-slack-bot.tar.gz && rm kakao-slack-bot.tar.gz'" 2>&1
if errorlevel 1 (
    echo [ERROR] 압축 해제 실패
    pause
    exit /b 1
)

echo [OK] 압축 해제 완료

echo.
echo [7/7] 설정 스크립트 실행 중...

REM setup-linux.sh 실행 권한 부여 및 실행
"%GIT_BASH%" -c "ssh -i '%PEM_KEY%' %SERVER_USER%@%SERVER_IP% 'cd %REMOTE_PATH% && chmod +x setup-linux.sh && bash setup-linux.sh'" 2>&1

REM 임시 파일 정리
if exist "%TEMP_TAR%" del /f /q "%TEMP_TAR%"

echo.
echo ========================================
echo 배포 완료!
echo ========================================
echo.
echo 다음 단계:
echo 1. SSH로 서버에 접속하세요:
echo    ssh -i "%PEM_KEY%" %SERVER_USER%@%SERVER_IP%
echo.
echo 2. .env 파일을 편집하세요:
echo    cd %REMOTE_PATH%
echo    nano .env
echo.
echo 3. 서비스를 시작하세요:
echo    sudo systemctl start kakao-slack-bot
echo.
echo 4. 서비스 상태를 확인하세요:
echo    sudo systemctl status kakao-slack-bot
echo.

pause

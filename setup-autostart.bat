@echo off
echo Windows 시작프로그램에 카카오-슬랙 봇을 등록합니다...

set "startup_folder=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "bot_path=%~dp0start-bot-background.bat"

echo 시작프로그램 폴더: %startup_folder%
echo 봇 경로: %bot_path%

copy "%bot_path%" "%startup_folder%\카카오슬랙봇.bat"

if %errorlevel%==0 (
    echo ✅ 성공! 컴퓨터 재시작 후 자동으로 봇이 실행됩니다.
    echo.
    echo 제거하려면: %startup_folder%\카카오슬랙봇.bat 파일을 삭제하세요.
) else (
    echo ❌ 실패! 관리자 권한으로 다시 시도해주세요.
)

echo.
pause
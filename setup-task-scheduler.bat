@echo off
echo Windows 작업 스케줄러에 카카오-슬랙 봇을 등록합니다...

set "task_name=KakaoSlackBot"
set "bot_path=%~dp0start-bot-background.bat"
set "working_dir=%~dp0"

echo 작업명: %task_name%
echo 실행파일: %bot_path%
echo 작업디렉토리: %working_dir%

schtasks /create /tn "%task_name%" /tr "\"%bot_path%\"" /sc onstart /ru "%USERNAME%" /f

if %errorlevel%==0 (
    echo ✅ 성공! 작업 스케줄러에 등록되었습니다.
    echo 컴퓨터 시작 시 자동으로 실행됩니다.
    echo.
    echo 확인: Win+R → taskschd.msc → 작업 스케줄러 라이브러리에서 '%task_name%' 확인
    echo 제거: schtasks /delete /tn "%task_name%" /f
) else (
    echo ❌ 실패! 관리자 권한으로 다시 시도해주세요.
)

echo.
pause
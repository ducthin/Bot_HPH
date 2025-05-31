@echo off
echo 🚀 Starting deployment to Heroku...

REM Check if Heroku CLI is installed
heroku --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Heroku CLI not found. Please install it from:
    echo https://devcenter.heroku.com/articles/heroku-cli
    pause
    exit /b 1
)

REM Login to Heroku
echo 🔐 Logging in to Heroku...
heroku login

REM Create new Heroku app (you can change the name)
set /p APP_NAME=Enter your app name (e.g., my-discord-bot): 
heroku create %APP_NAME%

REM Set environment variable
set /p BOT_TOKEN=Enter your Discord Bot Token: 
heroku config:set DISCORD_TOKEN=%BOT_TOKEN%

REM Add git remote if not exists
git remote add heroku https://git.heroku.com/%APP_NAME%.git

REM Deploy
echo 📦 Deploying to Heroku...
git add .
git commit -m "Deploy Discord bot to Heroku"
git push heroku main

REM Scale worker
heroku ps:scale web=1

echo ✅ Deployment completed!
echo 🎵 Your Happy House Bot should be online at: https://%APP_NAME%.herokuapp.com
echo Check logs with: heroku logs --tail

pause

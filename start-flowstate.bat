@echo off
echo Starting FlowState...
cd /d "c:\Users\LagunaNL5A\Desktop\untitlded ap\Flow State App\flowstate"
start /min cmd /c "npm start"
timeout /t 2 /nobreak >nul
start http://localhost:3000

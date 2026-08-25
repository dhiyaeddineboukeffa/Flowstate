@echo off
echo Starting FlowState...
cd /d "c:\Users\LagunaNL5A\Desktop\untitlded ap\Flow State App\flowstate"

echo Starting local server...
start cmd /k "npm start"

timeout /t 5 /nobreak >nul
echo Opening browser...
start http://localhost:3000

@echo off
echo Starting FlowState...
cd /d "c:\Users\LagunaNL5A\Desktop\untitlded ap\Flow State App\flowstate"

echo Starting local server...
start cmd /k "npm start"

echo Starting online tunnel...
start cmd /k "ngrok http --domain=unstiffly-overelliptical-elisha.ngrok-free.dev 127.0.0.1:3000"

timeout /t 5 /nobreak >nul
echo Opening browsers...
start http://localhost:3000
start https://unstiffly-overelliptical-elisha.ngrok-free.dev

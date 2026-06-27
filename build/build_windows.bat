@echo off
set SCRIPT_DIR=%~dp0
set PROJECT_ROOT=%SCRIPT_DIR%..\
cd /d "%PROJECT_ROOT%pipeline\python\agent"
pyinstaller --onefile --name autorainbow-agent ^
  --add-data "%PROJECT_ROOT%pipeline\jsx;jsx" ^
  --add-data "%PROJECT_ROOT%pipeline\python\docx_list_to_json.py;python" ^
  --add-data "%PROJECT_ROOT%pipeline\python\compare_snapshot.py;python" ^
  server.py
echo Build complete: dist\autorainbow-agent.exe

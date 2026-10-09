$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (!(Test-Path '.venv/Scripts/python.exe')) { python -m venv .venv }
& '.venv/Scripts/python.exe' -m pip install --index-url https://pypi.org/simple --disable-pip-version-check -r requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Python dependency installation failed.' }
& '.venv/Scripts/python.exe' download_models.py
if ($LASTEXITCODE -ne 0) { throw 'Pinned model download failed.' }

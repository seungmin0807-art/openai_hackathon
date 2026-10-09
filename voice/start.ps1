param(
    [ValidateSet('F1','F2','F3','F4','F5','M1','M2','M3','M4','M5')][string]$Voice = 'F4',
    [ValidateRange(5,10)][int]$Steps = 10,
    [ValidateRange(1,8)][int]$Threads = 4
)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
& '.venv/Scripts/python.exe' service.py --voice $Voice --steps $Steps --threads $Threads

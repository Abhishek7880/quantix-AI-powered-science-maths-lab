# Stops this project's API server (python -m src.api) on the given port, including its child processes
# (the venv launcher, the reloader and the worker), so a fresh start always runs the latest code.
# Other programs using the port are NOT stopped; a message is printed instead.
param([int]$Port = 8000)

$all = @(Get-CimInstance Win32_Process)
function Get-Descendants([int]$id) {
    foreach ($k in ($all | Where-Object { $_.ParentProcessId -eq $id })) { $k; Get-Descendants $k.ProcessId }
}

$portArg = "--port $Port"
$roots = @($all | Where-Object {
    ($_.CommandLine -like '*-m src.api*' -or $_.CommandLine -like '*-m src.serve*') -and
    ($_.CommandLine -like "*$portArg*" -or ($Port -eq 8000 -and $_.CommandLine -notlike '*--port*'))
})
$victims = @($roots) + @($roots | ForEach-Object { Get-Descendants $_.ProcessId })
# never stop a running training (python -m src.train), even though the API started it
$victims = $victims | Where-Object { $_.CommandLine -notlike '*src.train*' } | Sort-Object ProcessId -Unique

if ($victims.Count -gt 0) {
    Write-Host ("Stopping old server on port {0} (PID {1})" -f $Port, (($victims | ForEach-Object { $_.ProcessId }) -join ", "))
    foreach ($v in $victims) { Stop-Process -Id $v.ProcessId -Force -ErrorAction SilentlyContinue }
    for ($i = 0; $i -lt 20; $i++) {
        if (-not (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)) { break }
        Start-Sleep -Milliseconds 250
    }
}

$still = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($still) {
    $p = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $still.OwningProcess)
    Write-Host ("Port {0} is still used by PID {1} ({2}). Close that program, or start on another port." -f $Port, $still.OwningProcess, $(if ($p) { $p.Name } else { "unknown" }))
    exit 1
}
exit 0

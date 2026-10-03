# HomeBoard setup checker for Windows.
# Run from PowerShell:
#   powershell -ExecutionPolicy Bypass -File .\check-setup.ps1
# or paste the whole file into a PowerShell window.

$results = @()
function Check($name, $ok, $fix) {
  $script:results += [pscustomobject]@{ Item = $name; Status = $(if ($ok) { "OK" } else { "MISSING" }); Fix = $(if ($ok) { "" } else { $fix }) }
}
function Ver($cmd, $arg) {
  try { (& $cmd $arg 2>&1 | Select-Object -First 1).ToString().Trim() } catch { $null }
}

# 1. Tools
$git = Ver "git" "--version"
Check "Git            $git" ([bool]$git) "Install https://gitforwindows.org/"
$node = Ver "node" "--version"
Check "Node.js        $node" ([bool]$node) "Install LTS from https://nodejs.org/en/download"
$npm = Ver "npm.cmd" "--version"
Check "npm            $npm" ([bool]$npm) "Comes with Node.js; reinstall Node.js"
$py = Ver "python" "--version"
if ($py -match "Microsoft Store|was not found") { $py = $null }
Check "Python         $py" ([bool]$py) "Install https://www.python.org/downloads/ and tick 'Add Python to PATH'"

$vbox = @("$env:ProgramFiles\Oracle\VirtualBox\VBoxManage.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
Check "VirtualBox" ([bool]$vbox) "Install https://www.virtualbox.org/wiki/Downloads"
if ($vbox) {
  $vms = & $vbox list vms 2>$null
  $running = & $vbox list runningvms 2>$null
  Check "VM 'HomeAssistant' created" ([bool]($vms -match "HomeAssistant")) "Create the VM (guide step 2)"
  Check "VM 'HomeAssistant' running" ([bool]($running -match "HomeAssistant")) "Open VirtualBox and click Start"
}

$ts = (Test-Path "$env:ProgramFiles\Tailscale\tailscale.exe") -or (Test-Path "${env:ProgramFiles(x86)}\Tailscale\tailscale.exe")
Check "Tailscale on this PC (optional)" $ts "Optional: https://tailscale.com/download"

# 2. HomeBoard code
$repo = @(".\homeboard", "$HOME\homeboard", "$HOME\Documents\homeboard", ".") |
  Where-Object { Test-Path (Join-Path $_ "app\package.json") } | Select-Object -First 1
Check "HomeBoard code downloaded" ([bool]$repo) "git clone https://github.com/dejohnson31/homeboard.git"
if ($repo) {
  Check "App packages installed (npm install)" (Test-Path (Join-Path $repo "app\node_modules")) "cd $repo\app; npm install"
  Check "App built (npm run build)" (Test-Path (Join-Path $repo "app\dist\index.html")) "cd $repo\app; npm run build"
}

# 3. Home Assistant
$ha = $false
try { $r = Invoke-WebRequest "http://homeassistant.local:8123" -UseBasicParsing -TimeoutSec 8; $ha = $r.StatusCode -lt 500 } catch { $ha = $false }
Check "Home Assistant at homeassistant.local:8123" $ha "Start the VM; wait 5 min; check VM network = Bridged Adapter"

$share = Test-Path "\\homeassistant.local\config"
Check "Samba share \\homeassistant.local\config" $share "Install + start the Samba share add-on, then log in once in File Explorer"
if ($share) {
  Check "HomeBoard copied to config\www\homeboard" (Test-Path "\\homeassistant.local\config\www\homeboard\index.html") "Copy app\dist\* into \\homeassistant.local\config\www\homeboard"
}

# 4. School feed
$feed = $false
try { $r = Invoke-WebRequest "https://dejohnson31.github.io/homeboard/pca.ics" -UseBasicParsing -TimeoutSec 10; $feed = $r.Content -match "BEGIN:VCALENDAR" } catch { $feed = $false }
Check "School feed online (GitHub Pages)" $feed "Make repo public + Settings > Pages > GitHub Actions, then run the workflow"

$results | Format-Table -AutoSize -Wrap
$missing = ($results | Where-Object Status -eq "MISSING").Count
if ($missing -eq 0) { Write-Host "All set. Open http://homeassistant.local:8123/local/homeboard/index.html" -ForegroundColor Green }
else { Write-Host "$missing item(s) to fix. Do the Fix column top to bottom." -ForegroundColor Yellow }

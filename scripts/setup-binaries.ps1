# scripts/setup-binaries.ps1
function Install-Poppler {
    Write-Host "Checking Chocolatey installation..."
    if (-not (Get-Command choco -ErrorAction SilentlyContinue)) {
        Write-Host "Installing Chocolatey..."
        Set-ExecutionPolicy Bypass -Scope Process -Force
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
        iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
    }

    Write-Host "Installing poppler-utils..."
    choco install poppler -y --no-progress | Out-Null
    
    $popplerPath = "C:\ProgramData\chocolatey\lib\poppler\tools\bin"
    if (-not $env:Path.Contains($popplerPath)) {
        [System.Environment]::SetEnvironmentVariable(
            "Path",
            "$env:Path;$popplerPath",
            [System.EnvironmentVariableTarget]::Machine
        )
        $env:Path += ";$popplerPath"
    }
    Write-Host "Poppler installed successfully at $popplerPath"
}

cmd /c attrib +h "$env:ProgramData\chocolatey\bin\pdfinfo.exe"

try {
    Install-Poppler
    Write-Host "✅ Binary dependencies installed successfully"
    exit 0
}
catch {
    Write-Host "❌ Failed to install dependencies: $_" -ForegroundColor Red
    exit 1
}
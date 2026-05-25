# Determine the parent directory (project root) since this script runs from the "scripts" folder
$ParentDir = Split-Path $PSScriptRoot -Parent

# Determine the sync directory (fit-dashboard AppData folder, falling back to local "activities")
$AppDataDir = Join-Path $env:LOCALAPPDATA "fit-dashboard\fit-files"
if (Test-Path $AppDataDir) {
    $ActivitiesDir = $AppDataDir
    Write-Host "Detected dashboard sync directory: $ActivitiesDir" -ForegroundColor Cyan
} else {
    try {
        New-Item -ItemType Directory -Force -Path $AppDataDir | Out-Null
        $ActivitiesDir = $AppDataDir
        Write-Host "Created dashboard sync directory: $ActivitiesDir" -ForegroundColor Cyan
    } catch {
        $ActivitiesDir = Join-Path $ParentDir "activities"
        if (-not (Test-Path $ActivitiesDir)) {
            New-Item -ItemType Directory -Force -Path $ActivitiesDir | Out-Null
        }
        Write-Host "Using local fallback activities directory: $ActivitiesDir" -ForegroundColor Yellow
    }
}

Write-Host "Checking Garmin Connect for new activities..." -ForegroundColor Cyan

# Fetch the last 100 activities from Garmin
$activities = garmin activities list --limit 100

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to fetch activities list. Please run 'garmin auth login' to authenticate."
    exit
}

$newCount = 0
$skippedCount = 0

foreach ($line in $activities) {
    if ($line -match '^\s*(\d+)') {
        $id = $Matches[1]
        $expectedFitFile = Join-Path $ActivitiesDir "${id}_ACTIVITY.fit"
        
        if (Test-Path $expectedFitFile) {
            $skippedCount++
            continue
        }
        
        Write-Host "New activity found! Downloading ID: $id..." -ForegroundColor Green
        garmin activities download $id
        
        $zipFile = Join-Path $ParentDir "activity_${id}.zip"
        if (Test-Path $zipFile) {
            Expand-Archive -Path $zipFile -DestinationPath $ActivitiesDir -Force
            Remove-Item $zipFile -Force
            $newCount++
        }
    }
}

Write-Host "Sync complete!" -ForegroundColor Cyan
Write-Host "Downloaded: $newCount new activities." -ForegroundColor Green
Write-Host "Skipped: $skippedCount already downloaded activities." -ForegroundColor Gray

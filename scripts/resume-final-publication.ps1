$ErrorActionPreference = "Stop"
$Project = "C:\Users\KENAAR\Documents\Codex\2026-10-13\create-a-new-github-repository-named\work\pharos-recurring-payment-agent"
$SafeProject = $Project.Replace("\", "/")
Set-Location -LiteralPath $Project
$Base = "https://pharos-recurring-payment-agent.shoupeorg.workers.dev"

Write-Host "==> Commit exact saved source and evidence if needed" -ForegroundColor Cyan
git -c "safe.directory=$SafeProject" add --all
if ($LASTEXITCODE -ne 0) { throw "git add failed with exit code $LASTEXITCODE" }
git -c "safe.directory=$SafeProject" diff --cached --quiet
if ($LASTEXITCODE -eq 1) {
  git -c "safe.directory=$SafeProject" commit -m "Fix publication recovery"
  if ($LASTEXITCODE -ne 0) { throw "git commit failed with exit code $LASTEXITCODE" }
} elseif ($LASTEXITCODE -ne 0) {
  throw "git diff --cached failed with exit code $LASTEXITCODE"
}

$Repository = "https://github.com/shoupeorg/pharos-recurring-payment-agent.git"
$Remotes = @(git -c "safe.directory=$SafeProject" remote)
if ($LASTEXITCODE -ne 0) { throw "Listing remotes failed with exit code $LASTEXITCODE" }
if ($Remotes -contains "origin") {
  $Existing = (git -c "safe.directory=$SafeProject" remote get-url origin).Trim()
  if ($LASTEXITCODE -ne 0) { throw "Reading origin failed with exit code $LASTEXITCODE" }
  if ($Existing -ne $Repository) {
    git -c "safe.directory=$SafeProject" remote set-url origin $Repository
    if ($LASTEXITCODE -ne 0) { throw "Updating origin failed with exit code $LASTEXITCODE" }
  }
} else {
  git -c "safe.directory=$SafeProject" remote add origin $Repository
  if ($LASTEXITCODE -ne 0) { throw "Adding origin failed with exit code $LASTEXITCODE" }
}

Write-Host "==> Push existing main branch" -ForegroundColor Cyan
git -c "safe.directory=$SafeProject" push -u origin main
if ($LASTEXITCODE -ne 0) { throw "Git push failed with exit code $LASTEXITCODE" }
git -c "safe.directory=$SafeProject" fetch origin main
if ($LASTEXITCODE -ne 0) { throw "Git fetch failed with exit code $LASTEXITCODE" }
$Local = (git -c "safe.directory=$SafeProject" rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw "Could not resolve local HEAD." }
$Remote = (git -c "safe.directory=$SafeProject" rev-parse origin/main).Trim()
if ($LASTEXITCODE -ne 0) { throw "Could not resolve origin/main." }
if ($Local -ne $Remote) { throw "Commit mismatch: local=$Local remote=$Remote" }
$Required = @("README.md", "SKILL.md", "src/worker.js", "public/index.html", "evidence/manifest-v1.1.json", "wrangler.jsonc")
$RemoteFiles = @(git -c "safe.directory=$SafeProject" ls-tree -r --name-only origin/main)
if ($LASTEXITCODE -ne 0) { throw "Reading remote file tree failed with exit code $LASTEXITCODE" }
foreach ($File in $Required) {
  if ($RemoteFiles -notcontains $File) { throw "Required remote file is missing: $File" }
}

Write-Host "PUBLICATION VERIFIED" -ForegroundColor Green
Write-Host "Demo: $Base"
Write-Host "Repository: https://github.com/shoupeorg/pharos-recurring-payment-agent"
Write-Host "Commit: $Local"

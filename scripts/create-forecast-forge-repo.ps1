# Create ForecastForge/binance-trading-bot (if missing), set homepage/description/topics, push main.
# 1) Revoke any token you shared in chat; create a new PAT (repo, read:org) for the org account.
# 2) $env:GITHUB_TOKEN = "ghp_..."; .\scripts\create-forecast-forge-repo.ps1
# Or: gh auth login (as a user who can create repos in ForecastForge), no token in env, then run this script (edit to remove token login).

$ErrorActionPreference = "Stop"
$org = "ForecastForge"
$repo = "binance-trading-bot"
$full = "$org/$repo"
$desc = "binance trading bot | binance bot | binance AI trading bot | automated trading | auto trading | crypto | futures | spot | grid | strategy | scalping | DCA | arbitrage | market making. TypeScript CCXT spot bot. SuperTrend EMA+RSI. binance grid trading binance bot strategy testnet DRY_RUN."
if ($desc.Length -gt 350) { $desc = $desc.Substring(0, 350) }
$home = "https://www.binance.com/en/trade"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root

$t = $env:GITHUB_TOKEN; if (-not $t) { $t = $env:GH_TOKEN }
if ($t) { $t | & gh auth login -h github.com --with-token 2>&1 | Out-Null }

$err = 0; gh repo view $full 2>&1 | Out-Null; if ($LASTEXITCODE -ne 0) { $err = 1 }
if ($err -eq 1) {
  gh repo create $full --public --description $desc --homepage $home --source . --remote origin --push
  if ($LASTEXITCODE -ne 0) { throw "gh repo create failed. Use an org member with create-repo access." }
} else {
  if (-not (git config --get remote.origin.url 2>$null)) { git remote add origin "https://github.com/$full.git" }
  $meta = @{ description = $desc; homepage = $home } | ConvertTo-Json -Compress
  $mTmp = [IO.Path]::GetTempFileName() + ".json"
  [IO.File]::WriteAllText($mTmp, $meta, [Text.UTF8Encoding]::new($false))
  gh api -X PATCH "repos/$full" --input $mTmp
  Remove-Item $mTmp -Force
  git push -u origin main
  if ($LASTEXITCODE -ne 0) { throw "git push failed" }
}

# Topics (idempotent)
$topicJson = '{"names":["binance-trading-bot","binance-grid-trading-bot","binance-futures-trading-bot","binance-spot-trading-bot","binance-ai-trading-bot","binance-auto-trader","binance-dca-bot","binance-scalping-bot","binance-arbitrage-bot","binance-market-making-bot"]}'
$tmp = [IO.Path]::GetTempFileName() + ".json"
[System.IO.File]::WriteAllText($tmp, $topicJson, [Text.UTF8Encoding]::new($false))
gh api -X PUT "repos/$full/topics" -H "Accept: application/vnd.github+json" --input $tmp
Remove-Item $tmp -Force
Write-Host "OK: https://github.com/$full"

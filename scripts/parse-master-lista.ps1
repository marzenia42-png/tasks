param([string]$InputPath, [string]$OutputPath)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $InputPath)) { throw "Brak pliku: $InputPath" }

# Em-dash przez char code aby uniknąc Pulapka 1 (UTF-8 BOM PS 5.1)
$EM = [char]0x2014
$DELIM = " $EM "

$raw = Get-Content $InputPath -Raw -Encoding UTF8
# Drive MCP escape: backslashes przed markdown chars (ale rclone NIE escapuje, ten escape jest no-op tutaj)
$raw = $raw -replace '\\([#\[\]_~`<>!\\\-])', '$1'

$lines = $raw -split "`r?`n"

function MapCategory {
    param([string]$Cat)
    $c = $Cat.ToUpper().Trim()
    switch -Wildcard ($c) {
        'SOLA'              { return 'SOLA' }
        'PARTNER MEBLE'     { return 'PM' }
        'DB MEBLE / PARTNER'{ return 'PM' }
        'AGENCI'            { return 'Agenci' }
        'MAKE.COM'          { return 'Agenci' }
        'DB MEBLE'          { return 'DB' }
        'DB CONCEPT'        { return 'DB' }
        'SOCIAL'            { return 'DB' }
        default             { return 'Osobiste' }
    }
}

function ParseDate {
    param([string]$Token)
    $t = $Token.Trim()
    if ($t -match '^(\d{1,2})\.(\d{1,2})\.(\d{4})') {
        return ('{0:D4}-{1:D2}-{2:D2}' -f [int]$matches[3], [int]$matches[2], [int]$matches[1])
    }
    if ($t -match '^(\d{1,2})\D+(\d{1,2})\.(\d{4})') {
        return ('{0:D4}-{1:D2}-{2:D2}' -f [int]$matches[3], [int]$matches[2], [int]$matches[1])
    }
    $miesiace = @{
        'styczen'='01';'styczeń'='01';'luty'='02';'marzec'='03';'kwiecien'='04';'kwiecień'='04';
        'maj'='05';'czerwiec'='06';'lipiec'='07';'sierpien'='08';'sierpień'='08';
        'wrzesien'='09';'wrzesień'='09';'pazdziernik'='10';'październik'='10';'listopad'='11';'grudzien'='12';'grudzień'='12'
    }
    foreach ($k in $miesiace.Keys) {
        if ($t -match "(?i)$k\s+(\d{4})") {
            return "$($matches[1])-$($miesiace[$k])-28"
        }
    }
    if ($t -match 'Cz/Lp\s+(\d{4})') { return "$($matches[1])-06-30" }
    if ($t -match 'koniec\s+(\d{4})') { return "$($matches[1])-12-31" }
    if ($t -match '^(\d{4})$') { return "$($matches[1])-12-31" }
    return $null
}

$tasks = New-Object System.Collections.ArrayList
$currentH2 = ''
$currentH3 = ''
$currentStatus = 'todo'
$currentPriority = 'normal'

foreach ($line in $lines) {
    $trim = $line.Trim()
    if ([string]::IsNullOrWhiteSpace($trim)) { continue }

    if ($trim -match '^##\s+(.+)$' -and $trim -notmatch '^###') {
        $currentH2 = $matches[1]
        $h2u = $currentH2.ToUpper()
        if     ($h2u -match 'ZROBIONE')                 { $currentStatus='done';      $currentPriority='normal' }
        elseif ($h2u -match 'AKTYWNE|PILNE')            { $currentStatus='todo';      $currentPriority='urgent' }
        elseif ($h2u -match 'W TOKU')                   { $currentStatus='doing';     $currentPriority='important' }
        elseif ($h2u -match 'POMYS')                    { $currentStatus='idea';      $currentPriority='normal' }
        elseif ($h2u -match 'PORZUCONE|ZAWIESZONE')     { $currentStatus='abandoned'; $currentPriority='normal' }
        elseif ($h2u -match 'DATY')                     { $currentStatus='todo';      $currentPriority='important' }
        elseif ($h2u -match 'ALERTY')                   { $currentStatus='todo';      $currentPriority='normal' }
        elseif ($h2u -match 'PORTFELI')                 { $currentStatus='skip' }
        continue
    }
    if ($trim -match '^###\s+(.+)$') { $currentH3 = $matches[1]; continue }
    if ($currentStatus -eq 'skip') { continue }

    $matchedTwo = $false
    if ($trim -match '^-\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+(.+)$') {
        $matchedTwo = $true
        $tag1 = $matches[1].Trim()
        $tag2 = $matches[2].Trim()
        $rest = $matches[3].Trim()

        $dashIdx = $rest.LastIndexOf($DELIM)
        if ($dashIdx -gt 0) {
            $desc = $rest.Substring(0, $dashIdx).Trim()
            $source = $rest.Substring($dashIdx + $DELIM.Length).Trim()
        } else {
            $desc = $rest
            $source = ''
        }

        $cat = MapCategory -Cat $tag2
        $prio = $currentPriority
        if ($tag1 -match '(?i)^PILNE') { $prio = 'urgent' }
        $dueDate = ParseDate -Token $tag1

        [void]$tasks.Add([PSCustomObject]@{
            name        = $desc
            category    = $cat
            subcategory = $tag2
            status      = $currentStatus
            priority    = $prio
            due_date    = $dueDate
            source      = $source
            section_h2  = $currentH2.Trim()
            section_h3  = $currentH3.Trim()
            raw_tag     = $tag1
        })
        continue
    }
    if (-not $matchedTwo -and $trim -match '^-\s+\[([^\]]+)\]\s+(.+)$') {
        $tag1 = $matches[1].Trim()
        $rest = $matches[2].Trim()

        $dashIdx = $rest.LastIndexOf($DELIM)
        if ($dashIdx -gt 0) {
            $desc = $rest.Substring(0, $dashIdx).Trim()
            $source = $rest.Substring($dashIdx + $DELIM.Length).Trim()
        } else {
            $desc = $rest
            $source = ''
        }
        # Skip section divider like "## ## XXX" already filtered
        $desc = $desc -replace '^[^!-~]+', ''
        if ([string]::IsNullOrWhiteSpace($desc)) { continue }

        $dueDate = ParseDate -Token $tag1
        $subcat = if ($currentH2 -match '(?i)dat')   { 'DATA' }
                   elseif ($currentH2 -match '(?i)alert') { 'ALERT' }
                   else { 'OGOLNE' }

        [void]$tasks.Add([PSCustomObject]@{
            name        = $desc
            category    = 'Osobiste'
            subcategory = $subcat
            status      = $currentStatus
            priority    = $currentPriority
            due_date    = $dueDate
            source      = $source
            section_h2  = $currentH2.Trim()
            section_h3  = $currentH3.Trim()
            raw_tag     = $tag1
        })
    }
}

$json = $tasks | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($OutputPath, $json, [System.Text.UTF8Encoding]::new($false))

Write-Output ("Parsed: " + $tasks.Count + " tasks")
Write-Output ""
Write-Output "=== Breakdown by status ==="
$tasks | Group-Object status | Select-Object Name, Count | Sort-Object Count -Descending | Format-Table -AutoSize
Write-Output "=== Breakdown by category ==="
$tasks | Group-Object category | Select-Object Name, Count | Sort-Object Count -Descending | Format-Table -AutoSize

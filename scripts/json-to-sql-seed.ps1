param([string]$InputJson, [string]$OutputSql)

$ErrorActionPreference = 'Stop'

$tasks = Get-Content $InputJson -Raw -Encoding UTF8 | ConvertFrom-Json

$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine("-- Seed dario_tasks z MASTER_LISTA_ZADAN_DARIO_v2.md")
[void]$sb.AppendLine("-- Wygenerowane przez scripts\json-to-sql-seed.ps1")
[void]$sb.AppendLine("-- Liczba: $($tasks.Count) zadan")
[void]$sb.AppendLine("-- Idempotent: ON CONFLICT (external_id) DO NOTHING")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("begin;")
[void]$sb.AppendLine("")

$Q = [char]39  # single-quote

function EscSql {
    param([string]$s)
    if ($null -eq $s) { return 'NULL' }
    $e = $s.Replace([string]$Q, [string]$Q + [string]$Q)
    return ([string]$Q + $e + [string]$Q)
}

$idx = 0
$sha1 = [System.Security.Cryptography.SHA1]::Create()
foreach ($t in $tasks) {
    $idx++
    $idSource = "$($t.section_h2)|$($t.section_h3)|$($t.subcategory)|$($t.name)|$($t.source)"
    $hashBytes = $sha1.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($idSource))
    $extId = "seed-" + ([BitConverter]::ToString($hashBytes).Replace("-","").ToLower().Substring(0, 16))

    $name = EscSql $t.name
    $category = EscSql $t.category
    $subcategory = EscSql $t.subcategory
    $status = EscSql $t.status
    $priority = EscSql $t.priority
    $dueDate = if ($t.due_date) { "$Q$($t.due_date)$Q::date" } else { 'NULL' }
    $source = EscSql $t.source
    $extIdSql = EscSql $extId

    $line = "insert into public.dario_tasks (external_id, name, category, subcategory, status, priority, due_date, source) values ($extIdSql, $name, $category, $subcategory, $status, $priority, $dueDate, $source) on conflict (external_id) do nothing;"
    [void]$sb.AppendLine($line)
}

[void]$sb.AppendLine("")
[void]$sb.AppendLine("commit;")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("-- Verify:")
[void]$sb.AppendLine("-- select status, count(*) from public.dario_tasks group by status order by count(*) desc;")

[System.IO.File]::WriteAllText($OutputSql, $sb.ToString(), [System.Text.UTF8Encoding]::new($false))
Write-Output "Generated $idx INSERTs -> $OutputSql"
Write-Output "Size: $((Get-Item $OutputSql).Length) bytes"
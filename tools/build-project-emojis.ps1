# Genera el catálogo local con datos de Unicode Emoji 17.0 y CLDR 48.
$ErrorActionPreference = 'Stop'
$vendor = Join-Path $PSScriptRoot '../vendor'
$client = [Net.WebClient]::new()
$client.Encoding = [Text.Encoding]::UTF8
$annotations = [Collections.Generic.Dictionary[string, hashtable]]::new([StringComparer]::Ordinal)
foreach ($folder in @('annotations', 'annotationsDerived')) {
    $url = "https://raw.githubusercontent.com/unicode-org/cldr/release-48/common/$folder/es.xml"
    $xml = [xml]$client.DownloadString($url)
    foreach ($entry in $xml.SelectNodes('/ldml/annotations/annotation')) {
        $emoji = $entry.GetAttribute('cp').Replace([string][char]0xfe0f, '')
        if (!$annotations.ContainsKey($emoji)) { $annotations[$emoji] = @{} }
        $key = if ($entry.GetAttribute('type') -eq 'tts') { 'name' } else { 'keywords' }
        $annotations[$emoji][$key] = $entry.InnerText
    }
}
$groups = [ordered]@{
    'Objects' = 'Objetos'
    'Smileys & Emotion' = 'Caras y emociones'
    'People & Body' = 'Personas y gestos'
    'Animals & Nature' = 'Animales y naturaleza'
    'Food & Drink' = 'Comida y bebida'
    'Travel & Places' = 'Viajes y lugares'
    'Activities' = 'Actividades'
    'Symbols' = 'Símbolos'
    'Flags' = 'Banderas'
}
$catalog = [ordered]@{}
foreach ($label in $groups.Values) { $catalog[$label] = [Collections.Generic.List[object]]::new() }
$rows = $client.DownloadString('https://www.unicode.org/Public/17.0.0/emoji/emoji-test.txt') -split "\r?\n"
foreach ($row in $rows) {
    if ($row -match '^# group: (.+)$') {
        $group = $groups[$Matches[1]]
    } elseif ($group -and $row -match '; fully-qualified\s+# (\S+) E[\d.]+ (.+)$') {
        $emoji = $Matches[1]
        $annotationKey = $emoji.Replace([string][char]0xfe0f, '')
        $spanish = $annotations[$annotationKey]
        $name = if ($spanish.name) { $spanish.name } else { $Matches[2] }
        $catalog[$group].Add(@($emoji, $name, [string]$spanish.keywords))
    }
}
$json = ConvertTo-Json -InputObject $catalog -Depth 5 -Compress
$utf8 = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText((Join-Path $vendor 'project-emoji-data.js'), "/* Unicode Emoji 17.0 y CLDR 48. Unicode License V3 en LICENSE-unicode-emoji.txt. */`nglobalThis.PlanoProjectEmojiData = $json;`n", $utf8)
[IO.File]::WriteAllText((Join-Path $vendor 'LICENSE-unicode-emoji.txt'), $client.DownloadString('https://www.unicode.org/license.txt'), $utf8)

# Generates the narration as WAV files in each installed English voice.
# Output: out/voices/<voice>/<section>.wav
param([string]$Root = $PSScriptRoot)

$ErrorActionPreference = "Stop"
$sections = Get-Content (Join-Path $Root "narration.json") -Raw | ConvertFrom-Json

# Desktop (SAPI) voices: David, Zira
Add-Type -AssemblyName System.Speech
foreach ($voice in @("Microsoft David Desktop", "Microsoft Zira Desktop")) {
    $short = ($voice -split " ")[1]
    $dir = Join-Path $Root "out\voices\$short"
    New-Item -ItemType Directory -Force $dir | Out-Null
    foreach ($p in $sections.PSObject.Properties) {
        $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
        $s.SelectVoice($voice)
        $s.Rate = -1
        $s.SetOutputToWaveFile((Join-Path $dir "$($p.Name).wav"))
        $s.Speak($p.Value)
        $s.Dispose()
    }
}

# OneCore (WinRT) voice: Mark
[void][Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
[void][Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq "AsTask" -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq "IAsyncOperation``1"
})[0]
function Await($op, [Type]$type) {
    $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(); $t.Result
}
$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$mark = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.DisplayName -like "*Mark*" } | Select-Object -First 1
if ($mark) {
    $synth.Voice = $mark
    $synth.Options.SpeakingRate = 0.95
    $dir = Join-Path $Root "out\voices\Mark"
    New-Item -ItemType Directory -Force $dir | Out-Null
    foreach ($p in $sections.PSObject.Properties) {
        $stream = Await ($synth.SynthesizeTextToStreamAsync($p.Value)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
        $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
        $size = [uint32]$stream.Size
        [void](Await ($reader.LoadAsync($size)) ([uint32]))
        $bytes = New-Object byte[] $size
        $reader.ReadBytes($bytes)
        [IO.File]::WriteAllBytes((Join-Path $dir "$($p.Name).wav"), $bytes)
    }
}
"done"

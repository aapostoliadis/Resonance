param(
    [ValidateSet('status','play','pause','previous','next','stop','seek','repeat','shuffle','volume','mute')]
    [string]$Action = 'status',
    [long]$PositionMs = 0
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType=WindowsRuntime]
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } |
    Select-Object -First 1

function Wait-MediaOperation($Operation, [Type]$ResultType) {
    $task = $asTask.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
    if (!$task.Wait(2000)) { throw 'Windows media operation timed out.' }
    return $task.Result
}

$manager = Wait-MediaOperation ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$sessions = @($manager.GetSessions() | Where-Object {
    $_.SourceAppUserModelId -match '^(Spotify(?:\.exe)?|SpotifyAB\.SpotifyMusic_[a-z0-9]+!Spotify)(?:$)'
})
if ($sessions.Count -ne 1) {
    @{ available = $false; reason = $(if ($sessions.Count) { 'Close extra Spotify desktop sessions' } else { 'Play a track in Spotify desktop' }) } | ConvertTo-Json -Compress
    exit
}

$session = $sessions[0]
function Get-SpotifyVolume([int]$Level = -1, [int]$Mute = -1) {
    try {
        Add-Type -Path (Join-Path $PSScriptRoot 'spotify-volume.cs')
        [SpotifyVolume]::Access($Level, $Mute)
    } catch { -1 }
}
if ($Action -in 'volume','mute') {
    $result = if ($Action -eq 'volume') { Get-SpotifyVolume -Level $PositionMs } else { Get-SpotifyVolume -Mute $PositionMs }
    @{ available = $true; accepted = $result -ge 0 } | ConvertTo-Json -Compress
    exit
}
$info = $session.GetPlaybackInfo()
$timeline = $session.GetTimelineProperties()
$controls = $info.Controls
$repeatModes = @('None','List','Track')
$repeatMode = [string]$info.AutoRepeatMode
$supported = @{
    play = $controls.IsPlayEnabled
    pause = $controls.IsPauseEnabled
    previous = $controls.IsPreviousEnabled
    next = $controls.IsNextEnabled
    stop = $controls.IsStopEnabled -or $controls.IsPauseEnabled
    seek = $controls.IsPlaybackPositionEnabled -and $timeline.EndTime.TotalMilliseconds -gt 0
    repeat = $controls.IsRepeatEnabled
    shuffle = $controls.IsShuffleEnabled
}

if ($Action -ne 'status') {
    $accepted = $false
    if ($supported[$Action]) {
        $operation = switch ($Action) {
            play { $session.TryPlayAsync() }
            pause { $session.TryPauseAsync() }
            previous { $session.TrySkipPreviousAsync() }
            next { $session.TrySkipNextAsync() }
            repeat {
                $mode = [Windows.Media.MediaPlaybackAutoRepeatMode, Windows.Media, ContentType=WindowsRuntime]
                $session.TryChangeAutoRepeatModeAsync([Enum]::Parse($mode, $repeatModes[[int]$PositionMs]))
            }
            shuffle { $session.TryChangeShuffleActiveAsync($PositionMs -eq 1) }
            stop { if ($controls.IsStopEnabled) { $session.TryStopAsync() } else { $session.TryPauseAsync() } }
            seek {
                $position = [Math]::Min($timeline.EndTime.Ticks, [Math]::Max($timeline.StartTime.Ticks, $PositionMs * 10000))
                $session.TryChangePlaybackPositionAsync([long]$position)
            }
        }
        $accepted = Wait-MediaOperation $operation ([bool])
    }
    @{ available = $true; accepted = $accepted } | ConvertTo-Json -Compress
    exit
}

$track = Wait-MediaOperation ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
$volume = Get-SpotifyVolume
$positionMs = $timeline.Position.TotalMilliseconds
$playing = $info.PlaybackStatus.ToString() -eq 'Playing'
if ($playing -and $timeline.LastUpdatedTime.Year -gt 2000 -and $timeline.EndTime.TotalMilliseconds -gt 0) {
    $rate = if ($null -eq $info.PlaybackRate) { 1 } else { $info.PlaybackRate }
    $positionMs += [Math]::Max(0, ([DateTimeOffset]::UtcNow - $timeline.LastUpdatedTime).TotalMilliseconds) * $rate
}
@{
    available = $true
    title = $track.Title
    artist = $track.Artist
    playing = $playing
    repeat = $repeatModes.IndexOf($repeatMode)
    shuffle = $info.IsShuffleActive
    volume = $(if ($volume -ge 0) { $volume % 101 })
    muted = $volume -ge 101
    positionMs = [Math]::Min($timeline.EndTime.TotalMilliseconds, $positionMs)
    durationMs = $timeline.EndTime.TotalMilliseconds
    supported = $supported
} | ConvertTo-Json -Compress

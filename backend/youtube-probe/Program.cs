using System.Text.Json;
using YoutubeExplode;
using YoutubeExplode.Videos.Streams;

if (args.Length != 1) { Console.WriteLine("{\"ok\":false,\"category\":\"invalid_input\"}"); return; }
using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(65));
try {
    using var youtube = new YoutubeClient();
    var manifest = await youtube.Videos.Streams.GetManifestAsync(args[0], deadline.Token);
    var video = manifest.GetVideoOnlyStreams().OrderByDescending(s => s.VideoResolution.Height).ThenByDescending(s => s.Bitrate.BitsPerSecond).FirstOrDefault();
    if (video is null) throw new InvalidOperationException("No video stream");
    using var stream = await youtube.Videos.Streams.GetAsync(video, deadline.Token);
    var bytes = await stream.ReadAsync(new byte[65536], deadline.Token);
    Console.WriteLine(JsonSerializer.Serialize(new { ok = bytes > 0, engine = "YoutubeExplode", version = "6.6.2", formatCount = manifest.Streams.Count(), width = video.VideoResolution.Width, height = video.VideoResolution.Height, videoBytesRead = bytes }));
} catch (Exception ex) {
    var message = ex.Message.ToLowerInvariant();
    var category = message.Contains("bot") ? "bot_verification" : message.Contains("403") || message.Contains("forbidden") ? "blocked" : message.Contains("sign in") || message.Contains("login") ? "authentication" : ex is OperationCanceledException ? "timeout" : "extraction_failed";
    Console.WriteLine(JsonSerializer.Serialize(new { ok = false, engine = "YoutubeExplode", version = "6.6.2", category, errorType = ex.GetType().Name }));
}

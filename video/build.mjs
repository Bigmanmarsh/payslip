// Joins the raw recordings and the chosen voice into out/payslip-demo.mp4.
// Each section = one or more video clips + one narration file. A section lasts as
// long as its clips; the narration starts 0.3 s in and is padded with silence.
// If the narration is longer than the clips, the last frame is held.
//
// Usage: node build.mjs [voice]   (default: Mark)

import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";

const FF = readFileSync(".ffpath", "utf8").trim().replace(/^\/([a-z])\//, "$1:/");
const ffmpeg = (args) => execFileSync(`${FF}/ffmpeg.exe`, ["-v", "error", "-y", ...args], { stdio: "inherit" });
const duration = (f) => Number(execFileSync(`${FF}/ffprobe.exe`, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());

const voice = process.argv[2] ?? "Mark";
const cuts = JSON.parse(readFileSync("cuts.json", "utf8"));
mkdirSync("out/sections", { recursive: true });

const parts = [];
for (const [i, s] of cuts.sections.entries()) {
  const audio = `out/voices/${voice}/${s.audio}.wav`;
  const clipLen = s.clips.reduce((n, [, a, b]) => n + (b - a), 0);
  const total = Math.max(clipLen, duration(audio) + 0.6);
  const inputs = s.clips.flatMap(([f]) => ["-i", `out/raw/${f}.webm`]);
  const trims = s.clips.map(([, a, b], k) =>
    `[${k}:v]trim=${a}:${b},setpts=PTS-STARTPTS,fps=30,scale=1280:720,setsar=1[v${k}]`).join(";");
  const concat = `${s.clips.map((_, k) => `[v${k}]`).join("")}concat=n=${s.clips.length}:v=1:a=0[vc]`;
  const hold = `[vc]tpad=stop_mode=clone:stop_duration=${Math.max(0, total - clipLen).toFixed(2)}[v]`;
  const a = s.clips.length;
  const aud = `[${a}:a]adelay=300|300,apad,atrim=0:${total.toFixed(2)},aformat=sample_rates=48000:channel_layouts=stereo[a]`;
  const out = `out/sections/${String(i).padStart(2, "0")}-${s.audio}.mp4`;
  ffmpeg([...inputs, "-i", audio, "-filter_complex", `${trims};${concat};${hold};${aud}`,
    "-map", "[v]", "-map", "[a]", "-t", total.toFixed(2),
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", out]);
  console.log(`${out}: ${total.toFixed(1)} s`);
  parts.push(out);
}

writeFileSync("out/sections/list.txt", parts.map((p) => `file '${p.replace("out/sections/", "")}'`).join("\n"));
ffmpeg(["-f", "concat", "-safe", "0", "-i", "out/sections/list.txt", "-c", "copy", "-movflags", "+faststart", "out/payslip-demo.mp4"]);
console.log(`out/payslip-demo.mp4: ${duration("out/payslip-demo.mp4").toFixed(1)} s`);

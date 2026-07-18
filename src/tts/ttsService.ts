import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { promisify } from 'util';
import { config } from '../config/env';
import { logger } from '../utils/logger';

const execAsync = promisify(exec);

function cleanForTTS(text: string): string {
  return text
    // Markdown headers → just the heading text
    .replace(/^#{1,6}\s+/gm, '')
    // Bold / italic markers (**text**, *text*, __text__, _text_)
    .replace(/\*{1,3}([^*\n]*)\*{1,3}/g, '$1')
    .replace(/_{1,3}([^_\n]*)_{1,3}/g, '$1')
    // Inline code and fenced code blocks
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]*`/g, '')
    // Blockquote markers
    .replace(/^>\s*/gm, '')
    // Bullet / numbered list markers
    .replace(/^[ \t]*[-*+]\s+/gm, '')
    .replace(/^[ \t]*\d+[.)]\s+/gm, '')
    // Horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, '')
    // URLs
    .replace(/https?:\/\/\S+/g, '')
    // Em dash / en dash → natural pause
    .replace(/[—–]/g, ', ')
    // Ellipsis → period
    .replace(/\.{2,}/g, '.')
    // Common symbol expansions
    .replace(/&/g, ' and ')
    .replace(/%/g, ' percent')
    .replace(/\+/g, ' plus ')
    // Remove brackets but keep their contents
    .replace(/[[\](){}]/g, ' ')
    // Remove all remaining punctuation/symbols that have no spoken value
    .replace(/[#@|\\<>^~`*_=/]/g, ' ')
    // Collapse whitespace
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function estimateDurationSeconds(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return Math.ceil(words / 155) * 60;
}

function writeTempText(text: string): string {
  const tmpPath = path.join(os.tmpdir(), `tts_${Date.now()}.txt`);
  fs.writeFileSync(tmpPath, text, 'utf8');
  return tmpPath;
}

function nextAudioPath(): string {
  const dir = config.AUDIO_OUTPUT_DIR;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `audio_${Date.now()}.mp3`);
}

function pruneOldAudio(): void {
  const dir = config.AUDIO_OUTPUT_DIR;
  if (!fs.existsSync(dir)) return;

  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.mp3') || f.endsWith('.wav'))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  for (const file of files.slice(config.AUDIO_KEEP_COUNT)) {
    try {
      fs.unlinkSync(path.join(dir, file.name));
      logger.debug(`Pruned old audio: ${file.name}`);
    } catch { /* ignore */ }
  }
}

async function ttsEdgeTts(text: string, outputPath: string): Promise<void> {
  const tmpFile = writeTempText(text);
  try {
    await execAsync(`edge-tts --voice "${config.TTS_VOICE}" --file "${tmpFile}" --write-media "${outputPath}"`);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

async function ttsWindowsSapi(text: string, outputPath: string): Promise<void> {
  const wavPath = outputPath.replace(/\.mp3$/, '.wav');
  const tmpTxt = writeTempText(text);
  const tmpPs = tmpTxt.replace(/\.txt$/, '.ps1');

  fs.writeFileSync(tmpPs, `
$text = Get-Content -Path '${tmpTxt.replace(/'/g, "''")}' -Raw
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SetOutputToWaveFile('${wavPath.replace(/'/g, "''")}')
$synth.Speak($text)
$synth.Dispose()
`.trim(), 'utf8');

  try {
    await execAsync(`powershell -ExecutionPolicy Bypass -File "${tmpPs}"`);
    if (fs.existsSync(wavPath) && wavPath !== outputPath) {
      fs.renameSync(wavPath, outputPath);
    }
  } finally {
    try { fs.unlinkSync(tmpTxt); } catch { /* ignore */ }
    try { fs.unlinkSync(tmpPs); } catch { /* ignore */ }
  }
}

async function ttsStub(text: string, outputPath: string): Promise<void> {
  logger.info(`[stub] TTS skipped — would speak: "${text.slice(0, 60)}..."`);
  fs.writeFileSync(outputPath, '', 'utf8');
}

export interface TTSResult {
  audioPath: string;
  audioUrl: string;
  estimatedDurationSeconds: number;
}

export async function synthesize(text: string): Promise<TTSResult> {
  const clean = cleanForTTS(text);
  const outputPath = nextAudioPath();
  const provider = config.TTS_PROVIDER;
  logger.info(`TTS provider: ${provider} → ${path.basename(outputPath)}`);

  try {
    if (provider === 'edge-tts') {
      await ttsEdgeTts(clean, outputPath);
    } else if (provider === 'windows-sapi') {
      await ttsWindowsSapi(clean, outputPath);
    } else {
      await ttsStub(clean, outputPath);
    }
  } catch (err) {
    if (provider !== 'stub') {
      logger.warn(`TTS provider "${provider}" failed, falling back to stub: ${(err as Error).message}`);
      await ttsStub(clean, outputPath);
    } else {
      throw err;
    }
  }

  pruneOldAudio();

  const estimatedDurationSeconds = estimateDurationSeconds(clean);
  const audioUrl = '/audio/' + path.basename(outputPath);
  logger.info(`TTS complete — ${audioUrl} (~${estimatedDurationSeconds}s)`);

  return { audioPath: outputPath, audioUrl, estimatedDurationSeconds };
}

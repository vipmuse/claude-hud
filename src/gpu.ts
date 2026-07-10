import os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { getHudPluginDir } from './claude-config-dir.js';
import { createDebug } from './debug.js';
import type { GpuInfo } from './types.js';

const debug = createDebug('gpu');

type GpuReader = () => GpuInfo | null;

/**
 * nvidia-smi is by far the slowest data source in the HUD (~50-300ms per
 * invocation, longer when the GPU is waking from a low-power state). The
 * status line runs every ~300ms, so readings are cached on disk with a short
 * TTL and shared across concurrent sessions — GPU stats are global system
 * state, not session state. Failed probes (no NVIDIA GPU / no driver) are
 * cached too, so machines without nvidia-smi don't pay a spawn-fail cost on
 * every tick.
 */
const CACHE_FILENAME = 'gpu-cache.json';
const CACHE_TTL_MS = 3_000;

const MIB = 1024 * 1024;

const NVIDIA_SMI_ARGS = [
  '--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu',
  '--format=csv,noheader,nounits',
];

/** Parse one numeric CSV field; nvidia-smi reports "N/A" or "[N/A]" when a sensor is unavailable. */
function parseField(value: string | undefined): number | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === '' || /n\/a/i.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * Parse `nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu
 * --format=csv,noheader,nounits` output, e.g. `45, 8192, 24576, 62`
 * (memory values are MiB). Multi-GPU machines emit one line per GPU; the
 * first GPU (index 0) is reported.
 */
export function parseNvidiaSmi(output: string): GpuInfo | null {
  const line = output
    .split('\n')
    .map(l => l.trim())
    .find(l => l.length > 0);
  if (!line) return null;

  const fields = line.split(',');
  if (fields.length < 4) return null;

  const utilization = parseField(fields[0]);
  const memoryUsedMib = parseField(fields[1]);
  const memoryTotalMib = parseField(fields[2]);
  const temperature = parseField(fields[3]);

  const hasMemory = memoryUsedMib !== null && memoryTotalMib !== null && memoryTotalMib > 0;
  if (utilization === null && !hasMemory && temperature === null) {
    return null;
  }

  const memoryUsedBytes = hasMemory
    ? Math.min(Math.max(memoryUsedMib * MIB, 0), memoryTotalMib * MIB)
    : null;
  const memoryTotalBytes = hasMemory ? memoryTotalMib * MIB : null;

  return {
    utilizationPercent: utilization === null ? null : clampPercent(utilization),
    memoryUsedBytes,
    memoryTotalBytes,
    memoryUsedPercent: memoryUsedBytes !== null && memoryTotalBytes !== null
      ? clampPercent((memoryUsedBytes / memoryTotalBytes) * 100)
      : null,
    temperatureC: temperature === null ? null : Math.round(temperature),
  };
}

const readNvidiaGpu: GpuReader = () => {
  try {
    const output = execFileSync('nvidia-smi', NVIDIA_SMI_ARGS, {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
    });
    return parseNvidiaSmi(output);
  } catch (err) {
    debug('Failed to run nvidia-smi:', err instanceof Error ? err.message : err);
    return null;
  }
};

let readGpu: GpuReader = readNvidiaGpu;
let cacheEnabled = true;

type GpuCache = {
  saved_at: number;
  info: GpuInfo | null;
};

function getCachePath(): string {
  return path.join(getHudPluginDir(os.homedir()), CACHE_FILENAME);
}

function readCache(now: number): GpuCache | null {
  try {
    const content = fs.readFileSync(getCachePath(), 'utf8');
    const parsed = JSON.parse(content) as Partial<GpuCache>;
    if (
      typeof parsed !== 'object' || parsed === null ||
      typeof parsed.saved_at !== 'number' ||
      !('info' in parsed)
    ) {
      return null;
    }
    if (now - parsed.saved_at < 0 || now - parsed.saved_at >= CACHE_TTL_MS) {
      return null;
    }
    return { saved_at: parsed.saved_at, info: parsed.info ?? null };
  } catch {
    return null;
  }
}

function writeCache(info: GpuInfo | null, now: number): void {
  try {
    const cachePath = getCachePath();
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify({ saved_at: now, info } satisfies GpuCache));
  } catch (err) {
    debug('Failed to write GPU cache:', err instanceof Error ? err.message : err);
  }
}

export async function getGpuInfo(now: () => number = () => Date.now()): Promise<GpuInfo | null> {
  try {
    if (cacheEnabled) {
      const cached = readCache(now());
      if (cached) {
        return cached.info;
      }
    }

    const info = readGpu();
    if (cacheEnabled) {
      writeCache(info, now());
    }
    return info;
  } catch (err) {
    debug('Failed to get GPU info:', err instanceof Error ? err.message : err);
    return null;
  }
}

export function _setGpuReaderForTests(reader: GpuReader | null): void {
  readGpu = reader ?? readNvidiaGpu;
  // Injected readers must not hit (or pollute) the shared on-disk cache.
  cacheEnabled = reader === null;
}

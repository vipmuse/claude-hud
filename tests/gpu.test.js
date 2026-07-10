import { test } from 'node:test';
import assert from 'node:assert/strict';
import { _setGpuReaderForTests, getGpuInfo, parseNvidiaSmi } from '../dist/gpu.js';

const MIB = 1024 * 1024;

test('parseNvidiaSmi parses utilization, VRAM, and temperature', () => {
  const result = parseNvidiaSmi('45, 8192, 24576, 62\n');

  assert.deepEqual(result, {
    utilizationPercent: 45,
    memoryUsedBytes: 8192 * MIB,
    memoryTotalBytes: 24576 * MIB,
    memoryUsedPercent: 33,
    temperatureC: 62,
  });
});

test('parseNvidiaSmi uses the first GPU on multi-GPU machines', () => {
  const result = parseNvidiaSmi('10, 1024, 8192, 50\n90, 7168, 8192, 80\n');

  assert.equal(result.utilizationPercent, 10);
  assert.equal(result.temperatureC, 50);
});

test('parseNvidiaSmi maps N/A sensor fields to null', () => {
  const result = parseNvidiaSmi('[N/A], 512, 2048, N/A');

  assert.deepEqual(result, {
    utilizationPercent: null,
    memoryUsedBytes: 512 * MIB,
    memoryTotalBytes: 2048 * MIB,
    memoryUsedPercent: 25,
    temperatureC: null,
  });
});

test('parseNvidiaSmi clamps used VRAM to the reported total', () => {
  const result = parseNvidiaSmi('0, 9999, 1024, 40');

  assert.equal(result.memoryUsedBytes, 1024 * MIB);
  assert.equal(result.memoryUsedPercent, 100);
});

test('parseNvidiaSmi returns null for empty or malformed output', () => {
  assert.equal(parseNvidiaSmi(''), null);
  assert.equal(parseNvidiaSmi('not nvidia-smi output'), null);
  assert.equal(parseNvidiaSmi('N/A, N/A, N/A, N/A'), null);
});

test('getGpuInfo returns the reader result', async () => {
  const info = {
    utilizationPercent: 12,
    memoryUsedBytes: 1024 * MIB,
    memoryTotalBytes: 8192 * MIB,
    memoryUsedPercent: 13,
    temperatureC: 41,
  };
  _setGpuReaderForTests(() => info);

  assert.deepEqual(await getGpuInfo(), info);
});

test('getGpuInfo returns null when the GPU lookup fails', async () => {
  _setGpuReaderForTests(() => {
    throw new Error('boom');
  });

  assert.equal(await getGpuInfo(), null);
});

test.after(() => {
  _setGpuReaderForTests(null);
});

import type { RenderContext } from "../../types.js";
import { formatBytes } from "../../memory.js";
import { label, getContextColor, getQuotaColor, quotaBar, RESET } from "../colors.js";
import { getAdaptiveBarWidth } from "../../utils/terminal.js";
import { t } from "../../i18n/index.js";

// GPU core temperature bands (°C): below 70 is normal, 70-84 runs warm,
// 85+ is where consumer GPUs start thermal throttling.
const TEMP_WARNING_C = 70;
const TEMP_CRITICAL_C = 85;

export function renderGpuLine(ctx: RenderContext): string | null {
  const display = ctx.config?.display;
  const colors = ctx.config?.colors;

  if (ctx.config?.lineLayout !== "expanded") {
    return null;
  }

  if (display?.showGpu !== true) {
    return null;
  }

  const gpu = ctx.gpuUsage;
  if (!gpu) {
    return null;
  }

  const parts: string[] = [];

  if (gpu.utilizationPercent !== null) {
    const gpuLabel = label(t("label.gpu"), colors);
    const percentColor = getQuotaColor(gpu.utilizationPercent, colors);
    const bar = quotaBar(gpu.utilizationPercent, getAdaptiveBarWidth(), colors);
    parts.push(`${gpuLabel} ${bar} ${percentColor}${gpu.utilizationPercent}%${RESET}`);
  }

  if (
    gpu.memoryUsedBytes !== null &&
    gpu.memoryTotalBytes !== null &&
    gpu.memoryUsedPercent !== null
  ) {
    const vramLabel = label(t("label.vram"), colors);
    const percentColor = getQuotaColor(gpu.memoryUsedPercent, colors);
    const percent = `${percentColor}${gpu.memoryUsedPercent}%${RESET}`;
    parts.push(
      `${vramLabel} ${formatBytes(gpu.memoryUsedBytes)} / ${formatBytes(gpu.memoryTotalBytes)} (${percent})`,
    );
  }

  if (gpu.temperatureC !== null) {
    const tempColor = getContextColor(gpu.temperatureC, colors, {
      warning: TEMP_WARNING_C,
      critical: TEMP_CRITICAL_C,
    });
    parts.push(`${tempColor}${gpu.temperatureC}°C${RESET}`);
  }

  return parts.length > 0 ? parts.join(" │ ") : null;
}

import type { HudColorOverrides } from '../config.js';
import type { RenderContext } from '../types.js';
import { cyan, green, label } from './colors.js';

const MAX_ITEMS_SHOWN = 4;

export function renderSkillsLine(ctx: RenderContext): string | null {
  if (ctx.config?.display?.showSkills !== true) {
    return null;
  }

  return renderNameListLine('Skills', ctx.transcript.skills ?? [], ctx.config?.colors);
}

export function renderMcpLine(ctx: RenderContext): string | null {
  if (ctx.config?.display?.showMcp !== true) {
    return null;
  }

  return renderNameListLine('MCPs', ctx.transcript.mcpServers ?? [], ctx.config?.colors);
}

function renderNameListLine(
  title: string,
  names: string[],
  colors?: Partial<HudColorOverrides>,
): string | null {
  if (names.length === 0) {
    return null;
  }

  const visibleNames = names.slice(0, MAX_ITEMS_SHOWN).map(name => cyan(name));
  const hiddenCount = names.length - visibleNames.length;
  if (hiddenCount > 0) {
    visibleNames.push(label(`+${hiddenCount} more`, colors));
  }

  return `${green('✓')} ${title} ${label(`(${names.length})`, colors)}: ${visibleNames.join(', ')}`;
}

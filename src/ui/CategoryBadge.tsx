import type { SublayerCategory } from '../data/sublayerGroups';
import { PoiIcon } from '../three/poiIcons';

export function CategoryBadge({ category, icon = category.icon, muted, round }: {
  category: SublayerCategory;
  icon?: string;
  muted?: boolean;
  round?: boolean;
}) {
  return <span
    aria-hidden="true"
    className={round ? 'poi-swatch' : 'category-badge'}
    style={{ background: muted ? 'var(--muted)' : category.color }}
    title={muted ? `${category.label} (colours show with By use)` : category.label}
  ><PoiIcon name={icon} size={11} color="#ffffff"/></span>;
}

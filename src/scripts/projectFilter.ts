// Public project filter: progressive enhancement over the ProjectsSection markup (bundled external module).
import { decodeTags } from '../lib/projectFilter';

export function initProjectFilter(root: ParentNode): void {
  const filter = root.querySelector<HTMLElement>('[data-project-filter]');
  if (!filter) return;
  const chips = [...filter.querySelectorAll<HTMLButtonElement>('button[data-tag]')];
  const cards = [...root.querySelectorAll<HTMLElement>('[data-project-card]')];
  const groups = [...root.querySelectorAll<HTMLElement>('[data-project-group]')];
  const status = root.querySelector<HTMLElement>('[data-project-filter-status]');
  let active = '';

  const apply = (tag: string) => {
    active = tag;
    for (const c of chips) c.setAttribute('aria-pressed', String((c.dataset.tag ?? '') === tag));
    let shown = 0;
    for (const card of cards) {
      const tags = decodeTags(card.getAttribute('data-tags'));
      // Unparseable data-tags: keep the card visible under every filter.
      const visible = tag === '' || tags === null || tags.includes(tag);
      card.hidden = !visible;
      if (visible) shown++;
    }
    for (const g of groups) g.hidden = ![...g.querySelectorAll<HTMLElement>('[data-project-card]')].some((c) => !c.hidden);
    if (status) status.textContent = `Showing ${shown} of ${cards.length} projects`;
  };

  for (const c of chips) {
    c.addEventListener('click', () => {
      const tag = c.dataset.tag ?? '';
      apply(tag === active ? '' : tag);
    });
  }
  filter.hidden = false;
}

if (typeof document !== 'undefined' && !import.meta.env?.VITEST) initProjectFilter(document);

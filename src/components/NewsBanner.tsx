import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { fetchActiveNews } from '../api/endpoints';
import { ApiNewsItem } from '../api/types';
import './NewsBanner.css';

/** News ids the customer dismissed — they never come back on this browser. */
const DISMISS_KEY = 'ff14_news_dismissed_ids';

function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export default function NewsBanner() {
  const { t } = useTranslation();
  // All items fetched this session; dismissed ones stay in the stack (hidden)
  // so the banner keeps the exact same size no matter what is closed.
  const [items, setItems] = useState<ApiNewsItem[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let on = true;
    fetchActiveNews()
      .then((all) => {
        if (!on) return;
        const seen = new Set(readDismissed());
        setItems(all.filter((n) => !seen.has(n.id)));
      })
      .catch(() => {
        /* banner is best-effort — on fetch failure nothing is shown */
      });
    return () => {
      on = false;
    };
  }, []);

  const live = items.filter((n) => !dismissed.has(n.id));
  const current = live[index];
  if (!current) return null;

  const accent = /^#[0-9a-fA-F]{6}$/.test(current.accentColor ?? '')
    ? (current.accentColor as string)
    : undefined;

  const close = () => {
    try {
      localStorage.setItem(
        DISMISS_KEY,
        JSON.stringify([...new Set([...readDismissed(), current.id])]),
      );
    } catch {
      /* storage full — the item still disappears for this view */
    }
    const next = live.filter((n) => n.id !== current.id);
    setDismissed((prev) => new Set(prev).add(current.id));
    setIndex((i) => Math.min(i, next.length - 1));
  };

  return (
    <aside
      className="nb-banner"
      style={{ '--nb-accent': accent } as CSSProperties}
      role="region"
      aria-label={t('news.label')}
    >
      <button type="button" className="nb-close" onClick={close} aria-label={t('news.close')}>
        <X size={14} />
      </button>

      <div className="nb-stack">
        {items.map((n) => (
          <div key={n.id} className={`nb-item${n.id === current.id ? ' is-active' : ''}`}>
            {n.imageUrl && <img className="nb-image" src={n.imageUrl} alt="" />}
            <div className="nb-text">
              <h4 className="nb-title">{n.title}</h4>
              <p className="nb-desc">{n.description}</p>
            </div>
          </div>
        ))}
      </div>

      {live.length > 1 && (
        <div className="nb-nav">
          <button
            type="button"
            onClick={() => setIndex((i) => (i - 1 + live.length) % live.length)}
            aria-label={t('news.prev')}
          >
            <ChevronLeft size={16} />
          </button>
          <span className="nb-count">
            {index + 1} / {live.length}
          </span>
          <button
            type="button"
            onClick={() => setIndex((i) => (i + 1) % live.length)}
            aria-label={t('news.next')}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </aside>
  );
}

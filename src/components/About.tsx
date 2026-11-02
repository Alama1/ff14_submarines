import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import i18n from '../i18n';
import { itemName } from '../itemNames';
import {
  Anchor,
  RefreshCw,
  AlertTriangle,
  Ship,
  Users,
  Coins,
  Hammer,
  BookOpen,
  BadgeCheck,
  TrendingUp,
  Sparkles,
  Gem,
  Clock,
} from 'lucide-react';
import { fetchAboutStats } from '../api/endpoints';
import { ApiAboutStats } from '../api/types';
import { formatNumber } from '../utils/format';
import './About.css';

const FULFILLMENT_ROWS: Array<{
  key: keyof NonNullable<ApiAboutStats['fulfillmentTime']>;
  labelKey: string;
}> = [
  { key: 'p25Ms', labelKey: 'p25' },
  { key: 'medianMs', labelKey: 'median' },
  { key: 'p75Ms', labelKey: 'p75' },
  { key: 'p90Ms', labelKey: 'p90' },
  { key: 'avgMs', labelKey: 'avg' },
];

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(i18n.language, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return m > 0 ? `${d}d ${h}h ${m}m` : `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

/** Compact notation for huge gil amounts so they fit the stat cards. */
function formatCompact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 100_000) return `${(n / 1_000).toFixed(0)}K`;
  return formatNumber(n);
}

interface StatCardProps {
  icon: ReactNode;
  value: string;
  label: string;
  sub?: string;
}

function StatCard({ icon, value, label, sub }: StatCardProps) {
  return (
    <div className="ff-card ab-stat">
      <div className="ab-stat-icon">{icon}</div>
      <div className="ab-stat-value">{value}</div>
      <div className="ab-stat-label">{label}</div>
      {sub && <div className="ab-stat-sub">{sub}</div>}
    </div>
  );
}

export default function About() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<ApiAboutStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async (bypassCache = false) => {
    setLoading(true);
    setError('');
    try {
      setStats(await fetchAboutStats(bypassCache));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('common.unknownError'));
    } finally {
      setLoading(false);
    }
  }, []);

  const didFetch = useRef(false);
  useEffect(() => {
    if (!didFetch.current) {
      didFetch.current = true;
      fetchData();
    }
  }, [fetchData]);

  const days = daysSince(stats?.tracking.firstOrderAt ?? null);
  const maxTopQuantity = stats?.topParts[0]?.quantity ?? 0;
  const hasStory = !!stats && stats.orders.fulfilled > 0;

  return (
    <div className="fade-in ab-page">
      {/* Header */}
      <div className="ab-header">
        <div>
          <h2 className="ab-header-title">
            <Anchor size={22} /> {t('about.title')}
          </h2>
          <p className="ab-header-sub">{t('about.sub')}</p>
        </div>
        <div className="ab-header-actions">
          <button
            type="button"
            className="ff-btn-secondary ab-refresh-btn"
            onClick={() => fetchData(true)}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            {loading ? t('common.loading') : t('common.refresh')}
          </button>
        </div>
      </div>

      {error && (
        <div className="ff-alert ff-alert-warning ab-alert">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !stats && (
        <div className="ab-loading">
          <RefreshCw size={36} className="spin ab-loading-spinner" />
          <p className="ab-loading-text">{t('about.loadingText')}</p>
        </div>
      )}

      {stats && (
        <>
          {/* Welcome intro */}
          <div className="ff-card-framed ab-intro">
            <div className="ab-intro-head">
              <div className="ab-intro-avatar">
                <Anchor size={26} />
              </div>
              <div>
                <h3 className="ab-intro-title">{t('about.welcome')}</h3>
                <span className="ab-intro-role">{t('about.role')}</span>
              </div>
            </div>
            {hasStory ? (
              <p className="ab-intro-text">
                <Trans
                  i18nKey="about.introStory"
                  values={{
                    date: formatDate(stats.tracking.firstOrderAt),
                    days: t('units.day', { count: days ?? 0, n: days ?? 0 }),
                    orders: t('units.orderFulfilled', {
                      count: stats.orders.fulfilled,
                      n: formatNumber(stats.orders.fulfilled),
                    }),
                    clients: t('units.uniqueClient', {
                      count: stats.orders.uniqueClients,
                      n: formatNumber(stats.orders.uniqueClients),
                    }),
                    parts: t('units.partCrafted', {
                      count: stats.crafting.fulfilledParts,
                      n: formatNumber(stats.crafting.fulfilledParts),
                    }),
                  }}
                  components={{
                    name: <strong />,
                    d: <strong />,
                    dy: <strong />,
                    o: <strong />,
                    c: <strong />,
                    p: <strong />,
                  }}
                />
              </p>
            ) : (
              <p className="ab-intro-text">
                <Trans i18nKey="about.introFresh" components={{ name: <strong /> }} />
              </p>
            )}
          </div>

          {/* Hero stats */}
          <div className="ab-hero-grid">
            <StatCard
              icon={<Hammer size={20} />}
              value={formatNumber(stats.crafting.fulfilledParts)}
              label={t('about.partsCrafted')}
              sub={t('about.acrossOrders', { n: formatNumber(stats.orders.fulfilled) })}
            />
            <StatCard
              icon={<BadgeCheck size={20} />}
              value={formatNumber(stats.orders.fulfilled)}
              label={t('about.ordersFulfilled')}
              sub={t('about.lastDelivery', { date: formatDate(stats.tracking.lastFulfilledAt) })}
            />
            <StatCard
              icon={<Users size={20} />}
              value={formatNumber(stats.orders.uniqueClients)}
              label={t('about.uniqueClients')}
              sub={t('about.servedToDate')}
            />
            <StatCard
              icon={<Coins size={20} />}
              value={formatCompact(stats.orders.revenue)}
              label={t('about.gilRevenue')}
              sub={t('about.orderVolume', { n: formatNumber(stats.orders.revenue) })}
            />
            <StatCard
              icon={<Sparkles size={20} />}
              value={formatCompact(stats.orders.discountsGiven)}
              label={t('about.gilSaved')}
              sub={t('about.viaDiscounts', { n: formatNumber(stats.orders.discountsGiven) })}
            />
            <StatCard
              icon={<Gem size={20} />}
              value={formatCompact(stats.precrafts.worth)}
              label={t('about.precrafts')}
              sub={t('about.precraftSub')}
            />
          </div>

          {/* Fulfillment time */}
          {stats.fulfillmentTime && (
            <section className="ab-section">
              <h3 className="ab-section-title">
                <Clock size={16} /> {t('about.fulTitle')}
              </h3>
              <div className="ff-card ab-ful-card">
                {FULFILLMENT_ROWS.map((row) => {
                  const value = stats.fulfillmentTime![row.key];
                  const max = stats.fulfillmentTime!.p90Ms;
                  return (
                    <div key={row.key} className={`ab-ful-row ${row.key === 'medianMs' ? 'is-median' : ''}`}>
                      <span className="ab-ful-label">{t(`about.ful.${row.labelKey}`)}</span>
                      <div className="ab-top-bar">
                        <div
                          className="ab-top-bar-fill"
                          style={{
                            width: `${
                              max > 0 ? Math.max(6, Math.round((value / max) * 100)) : 0
                            }%`,
                          }}
                        />
                      </div>
                      <span className="ab-ful-value">{formatDuration(value)}</span>
                    </div>
                  );
                })}
                <p className="ab-top-note">{t('about.fulNote', { n: formatNumber(stats.fulfillmentTime.orderCount) })}</p>
              </div>
            </section>
          )}

          {/* Most requested parts */}
          {stats.topParts.length > 0 && (
            <section className="ab-section">
              <h3 className="ab-section-title">
                <TrendingUp size={16} /> {t('about.topTitle')}
              </h3>
              <div className="ff-card ab-top-parts">
                {stats.topParts.map((part, i) => (
                  <div key={part.name} className="ab-top-row">
                    <span className="ab-top-rank">#{i + 1}</span>
                    <span className="ab-top-name">{itemName(part.name)}</span>
                    <div className="ab-top-bar">
                      <div
                        className="ab-top-bar-fill"
                        style={{
                          width: `${
                            maxTopQuantity > 0 ? Math.max(6, Math.round((part.quantity / maxTopQuantity) * 100)) : 0
                          }%`,
                        }}
                      />
                    </div>
                    <span className="ab-top-qty">{formatNumber(part.quantity)}</span>
                  </div>
                ))}
                <p className="ab-top-note">{t('about.topNote')}</p>
              </div>
            </section>
          )}

          {/* Why trust the workshop */}
          <section className="ab-section">
            <h3 className="ab-section-title">
              <BookOpen size={16} /> {t('about.whyTitle')}
            </h3>
            <div className="ab-trust-grid">
              <div className="ff-card ab-trust-card">
                <Ship size={18} className="ab-trust-icon" />
                <h4>{t('about.trust1Title')}</h4>
                <p>{t('about.trust1Text')}</p>
              </div>
              <div className="ff-card ab-trust-card">
                <BadgeCheck size={18} className="ab-trust-icon" />
                <h4>{t('about.trust2Title')}</h4>
                <p>{t('about.trust2Text')}</p>
              </div>
              <div className="ff-card ab-trust-card">
                <Hammer size={18} className="ab-trust-icon" />
                <h4>{t('about.trust3Title')}</h4>
                <p>{t('about.trust3Text')}</p>
              </div>
            </div>
          </section>

          <p className="ab-updated">{t('about.updated', { date: formatDate(stats.generatedAt) })}</p>
        </>
      )}
    </div>
  );
}

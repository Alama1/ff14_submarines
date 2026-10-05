import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
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
  label: string;
}> = [
  { key: 'p25Ms', label: '25th percentile' },
  { key: 'medianMs', label: 'Median' },
  { key: 'p75Ms', label: '75th percentile' },
  { key: 'p90Ms', label: '90th percentile' },
  { key: 'avgMs', label: 'Average' },
];

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
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
  const [stats, setStats] = useState<ApiAboutStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async (bypassCache = false) => {
    setLoading(true);
    setError('');
    try {
      setStats(await fetchAboutStats(bypassCache));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error fetching data.');
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
            <Anchor size={22} /> About the Workshop
          </h2>
          <p className="ab-header-sub">
            Every number on this page is pulled live from the Alamai stock and order tracking
            system!
          </p>
        </div>
        <div className="ab-header-actions">
          <button
            type="button"
            className="ff-btn-secondary ab-refresh-btn"
            onClick={() => fetchData(true)}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            {loading ? 'Loading…' : 'Refresh'}
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
          <p className="ab-loading-text">Loading workshop statistics…</p>
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
                <h3 className="ab-intro-title">Welcome!</h3>
                <span className="ab-intro-role">Alamai — owner &amp; crafter</span>
              </div>
            </div>
            {hasStory ? (
              <p className="ab-intro-text">
                I'm <strong>Alamai</strong>, the sole owner of this submarine building empire,
                running the workshop together with a trusted circle of crafters. I started tracking
                orders on <strong>{formatDate(stats.tracking.firstOrderAt)}</strong> — that's{' '}
                <strong>{days}</strong> day{days !== 1 ? 's' : ''} of crafting and counting — and
                since then <strong>{formatNumber(stats.orders.fulfilled)}</strong> order
                {stats.orders.fulfilled !== 1 ? 's' : ''} have been fulfilled for{' '}
                <strong>{formatNumber(stats.orders.uniqueClients)}</strong> unique client
                {stats.orders.uniqueClients !== 1 ? 's' : ''}. That adds up to{' '}
                <strong>{formatNumber(stats.crafting.fulfilledParts)}</strong> submarine parts
                crafted and delivered across Eorzea.
              </p>
            ) : (
              <p className="ab-intro-text">
                I'm <strong>Alamai</strong>, the sole owner of this submarine building empire,
                running the workshop together with a trusted circle of crafters. The workshop
                ledger is still warming up — no fulfilled orders recorded yet. Be the first to
                place an order!
              </p>
            )}
          </div>

          {/* Hero stats */}
          <div className="ab-hero-grid">
            <StatCard
              icon={<Hammer size={20} />}
              value={formatNumber(stats.crafting.fulfilledParts)}
              label="Parts crafted"
              sub={`across ${formatNumber(stats.orders.fulfilled)} fulfilled orders`}
            />
            <StatCard
              icon={<BadgeCheck size={20} />}
              value={formatNumber(stats.orders.fulfilled)}
              label="Orders fulfilled"
              sub={`last delivery: ${formatDate(stats.tracking.lastFulfilledAt)}`}
            />
            <StatCard
              icon={<Users size={20} />}
              value={formatNumber(stats.orders.uniqueClients)}
              label="Unique clients"
              sub="served to date"
            />
            <StatCard
              icon={<Coins size={20} />}
              value={formatCompact(stats.orders.revenue)}
              label="Gil in fulfilled orders"
              sub={`total order volume — ${formatNumber(stats.orders.revenue)} gil`}
            />
            <StatCard
              icon={<Sparkles size={20} />}
              value={formatCompact(stats.orders.discountsGiven)}
              label="Gil saved by clients"
              sub={`via automatic bulk discounts — ${formatNumber(stats.orders.discountsGiven)} gil`}
            />
            <StatCard
              icon={<Gem size={20} />}
              value={formatCompact(stats.precrafts.worth)}
              label="Pre-crafts worth right now"
              sub="to make sure that I can deliver your order as fast as I can!"
            />
          </div>

          {/* Fulfillment time */}
          {stats.fulfillmentTime && (
            <section className="ab-section">
              <h3 className="ab-section-title">
                <Clock size={16} /> Order fulfillment time
              </h3>
              <div className="ff-card ab-ful-card">
                {FULFILLMENT_ROWS.map((row) => {
                  const value = stats.fulfillmentTime![row.key];
                  const max = stats.fulfillmentTime!.p90Ms;
                  return (
                    <div key={row.key} className={`ab-ful-row ${row.key === 'medianMs' ? 'is-median' : ''}`}>
                      <span className="ab-ful-label">{row.label}</span>
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
                <p className="ab-top-note">
                  How long past orders took from creation to handover — across{' '}
                  {formatNumber(stats.fulfillmentTime.orderCount)} fulfilled orders.
                </p>
              </div>
            </section>
          )}

          {/* Most requested parts */}
          {stats.topParts.length > 0 && (
            <section className="ab-section">
              <h3 className="ab-section-title">
                <TrendingUp size={16} /> Most requested parts
              </h3>
              <div className="ff-card ab-top-parts">
                {stats.topParts.map((part, i) => (
                  <div key={part.name} className="ab-top-row">
                    <span className="ab-top-rank">#{i + 1}</span>
                    <span className="ab-top-name">{part.name}</span>
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
                <p className="ab-top-note">
                  Ranked by total units delivered with fulfilled orders.
                </p>
              </div>
            </section>
          )}

          {/* Why trust the workshop */}
          <section className="ab-section">
            <h3 className="ab-section-title">
              <BookOpen size={16} /> Why order here
            </h3>
            <div className="ab-trust-grid">
              <div className="ff-card ab-trust-card">
                <Ship size={18} className="ab-trust-icon" />
                <h4>Every order gets a tracking code</h4>
                <p>
                  The moment you place an order you receive a unique code — follow its progress
                  from confirmation to delivery on the Orders tab, any time.
                </p>
              </div>
              <div className="ff-card ab-trust-card">
                <BadgeCheck size={18} className="ab-trust-icon" />
                <h4>A transparent production pipeline</h4>
                <p>
                  Confirmed → In progress → Finished → Fulfilled. You always know exactly which
                  production stage your submarine is in.
                </p>
              </div>
              <div className="ff-card ab-trust-card">
                <Hammer size={18} className="ab-trust-icon" />
                <h4>Powered by a crafter network</h4>
                <p>
                  A trusted circle of crafters keeps the workshop stocked with materials and
                  pre-crafts — fairly paid, quality checked, so your order never waits on one
                  pair of hands.
                </p>
              </div>
            </div>
          </section>

          <p className="ab-updated">
            Figures generated {formatDate(stats.generatedAt)} · live from the Alamai stock system
          </p>
        </>
      )}
    </div>
  );
}

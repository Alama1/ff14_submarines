import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import i18n from '../i18n';
import { itemName } from '../itemNames';
import {
  AlertTriangle,
  Boxes,
  Check,
  Hammer,
  Minus,
  Plus,
  Search,
  Send,
  Sparkles,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { formatNumber } from '../utils/format';
import { addRecentClaimCode } from '../utils/orderCodes';
import { getTrustedAccessCode } from '../utils/trustedAccess';
import { submitClaim } from '../api/endpoints';
import type { ApiCraftClaim, ApiCrafterDiscount } from '../api/types';
import './MaterialsCalculator.css';
import './ClaimCrafts.css';

export interface ClaimItem {
  id: string;
  name: string;
  /** Effective per-unit price from the live price feed (null = unpriced). */
  unitPrice: number | null;
  /** How many units the workshop still needs (from /inventory/missing). */
  remaining: number;
}

interface Entry {
  id: string;
  qty: number;
}

/** Animates a number towards its target with an ease-out tween. */
function useCountUp(target: number, duration = 500): number {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = Math.round(from + (target - from) * eased);
      fromRef.current = value;
      setDisplay(value);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return display;
}

/** FF14 max stack size. */
const STACK_SIZE = 999;

/** Claim ceiling: what the workshop needs, rounded up to full stacks, plus one extra stack (4500 -> 5994). */
function maxClaimQty(remaining: number): number {
  return (Math.ceil(remaining / STACK_SIZE) + 1) * STACK_SIZE;
}

/** "1 stack + 101" for 1100 — only meaningful once a full stack is reached. */
function stackLabel(qty: number): string | null {
  if (qty < STACK_SIZE) return null;
  const stacks = Math.floor(qty / STACK_SIZE);
  const rem = qty % STACK_SIZE;
  const label = i18n.t('claim.stacks', { count: stacks, n: stacks });
  return rem > 0 ? `${label} + ${rem}` : label;
}

function highlight(name: string, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return name;
  const idx = name.toLowerCase().indexOf(q);
  if (idx === -1) return name;
  return (
    <>
      {name.slice(0, idx)}
      <span className="mc-match">{name.slice(idx, idx + q.length)}</span>
      {name.slice(idx + q.length)}
    </>
  );
}

export default function ClaimCrafts({
  items,
  bonusTiers = [],
  onClose,
  onClaimed,
}: {
  items: ClaimItem[];
  /** Bulk bonus tiers from the backend — claiming more items yields a higher payout. */
  bonusTiers?: ApiCrafterDiscount[];
  onClose: () => void;
  /** Called after a claim is submitted — switches the user to "My Claims". */
  onClaimed: (code: string) => void;
}) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [query, setQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [rawActiveIndex, setActiveIndex] = useState(0);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const [nickname, setNickname] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState<ApiCraftClaim | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  // Trusted crafters may pass Max (with a warning); everyone else is clamped.
  const trusted = !!getTrustedAccessCode();
  const capOf = (id: string): number => {
    const item = itemsById.get(id);
    return item && item.remaining > 0 ? maxClaimQty(item.remaining) : Infinity;
  };
  const clampQty = (id: string, qty: number) => Math.min(qty, trusted ? Infinity : capOf(id));

  // Suggestion order: what the workshop still needs first, then the rest
  // Search + sort match the localized display names, not the English source
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? items.filter((i) => itemName(i.name).toLowerCase().includes(q)) : items;
    return [...filtered].sort((a, b) => {
      const aNeed = a.remaining > 0 ? 0 : 1;
      const bNeed = b.remaining > 0 ? 0 : 1;
      if (aNeed !== bNeed) return aNeed - bNeed;
      if (aNeed === 0 && b.remaining !== a.remaining) return b.remaining - a.remaining;
      return itemName(a.name).localeCompare(itemName(b.name));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, query, i18n.language]);

  const activeIndex = Math.min(
    rawActiveIndex,
    Math.max(0, suggestions.length - 1)
  );

  const addEntry = (item: ClaimItem, quantity: number) => {
    const safeQty = Math.max(1, Math.floor(quantity) || 1);
    setEntries((prev) => {
      const existing = prev.find((e) => e.id === item.id);
      if (existing) {
        return prev.map((e) =>
          e.id === item.id ? { ...e, qty: clampQty(item.id, e.qty + safeQty) } : e
        );
      }
      return [...prev, { id: item.id, qty: clampQty(item.id, safeQty) }];
    });
    setJustAddedId(item.id);
    window.setTimeout(() => setJustAddedId(null), 700);
    searchRef.current?.focus();
  };

  const handleAddFromDropdown = (item: ClaimItem) => {
    addEntry(item, 1);
    setQuery('');
    setDropdownOpen(true);
  };

  const changeQty = (id: string, delta: number) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, qty: Math.max(1, clampQty(id, e.qty + delta)) } : e))
    );
  };

  const setEntryQty = (id: string, value: number) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, qty: Math.max(1, clampQty(id, Math.floor(value) || 1)) } : e))
    );
  };

  const removeEntry = (id: string) => setEntries((prev) => prev.filter((e) => e.id !== id));

  /** Rounds every entry up to full stacks of 999 (e.g. 1200 -> 1998). */
  const roundUpToStacks = () => {
    setEntries((prev) =>
      prev.map((e) => ({ ...e, qty: Math.ceil(e.qty / STACK_SIZE) * STACK_SIZE }))
    );
  };

  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setDropdownOpen(true);
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = suggestions[activeIndex] ?? suggestions[0];
      if (item) handleAddFromDropdown(item);
    } else if (e.key === 'Escape') {
      setDropdownOpen(false);
    }
  };

  const priced = entries
    .map((e) => ({ entry: e, item: itemsById.get(e.id) }))
    .filter((x): x is { entry: Entry; item: ClaimItem } => x.item !== undefined);
  const totalPayout = priced.reduce(
    (sum, { entry, item }) => sum + (item.unitPrice ? item.unitPrice * entry.qty : 0),
    0
  );
  const unpricedCount = priced.filter(({ item }) => !item.unitPrice).length;
  const totalUnits = entries.reduce((s, e) => s + e.qty, 0);

  // Backend config: highest tier whose threshold <= total item count — bulk supply pays more
  const activeBonus = useMemo(() => {
    const sorted = [...bonusTiers].sort((a, b) => b.threshold - a.threshold);
    const matching = sorted.find((d) => totalUnits >= d.threshold);
    if (!matching) return null;
    return { threshold: matching.threshold, bonusPercent: Number(matching.discountPercent) || 0 };
  }, [bonusTiers, totalUnits]);
  const bonusPct = activeBonus?.bonusPercent ?? 0;
  const bonusAmount = Math.round(totalPayout * (bonusPct / 100));
  const finalPayout = totalPayout + bonusAmount;
  const animatedTotal = useCountUp(finalPayout);

  const canSubmit =
    entries.length > 0 && nickname.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      const accessCode = getTrustedAccessCode();
      const claim = await submitClaim({
        nickname: nickname.trim(),
        items: entries.map((e) => ({ materialId: e.id, quantity: e.qty })),
        ...(accessCode ? { accessCode } : {}),
      });
      // Register the claim the moment it exists — "My claims" must show it
      // even if the user never clicks "View My Claims".
      addRecentClaimCode(claim.claimCode);
      setSubmitted(claim);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('claim.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setEntries([]);
    setNickname('');
    setError('');
    setSubmitted(null);
  };

  // ─── Success view ───────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="ff-card-framed mc-card cc-card fade-in">
        <div className="cc-success">
          <div className="cc-success-icon">
            <Check size={34} />
          </div>
          <h3 className="cc-success-title">{t('claim.successTitle')}</h3>
          {submitted.status === 'confirmed' ? (
            <p className="cc-success-sub">
              <Trans i18nKey="claim.successTrustedSub" components={{ strong: <strong /> }} />
            </p>
          ) : (
            <p className="cc-success-sub">
              <Trans
                i18nKey="claim.successSub"
                components={{ strong: <strong />, handle: <strong>@Alamai</strong> }}
              />
            </p>
          )}
          {/* Stored a code but the claim came back pending -> it was rejected/rotated */}
          {submitted.status === 'pending' && getTrustedAccessCode() && (
            <p className="cc-success-sub">{t('claim.trustedRejected')}</p>
          )}

          <div className="cc-success-payout">
            <span className="cc-success-payout-label">{t('claim.payout')}</span>
            <span className="gil-price cc-success-payout-amount">
              <span>{formatNumber(submitted.total)}</span>
              <span className="gil-coin mc-coin-lg">G</span>
            </span>
            {Number(submitted.bonusPct) > 0 && (
              <span className="cc-success-payout-meta">
                {t('claim.inclBonus', { pct: Number(submitted.bonusPct) })}
              </span>
            )}
            {unpricedCount > 0 && (
              <span className="cc-success-payout-meta">{t('claim.finalConfirmed')}</span>
            )}
          </div>

          <p className="cc-mistake-note">{t('claim.mistakeNote')}</p>

          <div className="cc-success-actions">
            <button
              type="button"
              className="ff-btn"
              onClick={() => onClaimed(submitted.claimCode)}
            >
              <Hammer size={14} />
              {t('claim.viewMyClaims')}
            </button>
            <button type="button" className="ff-btn-secondary" onClick={resetForm}>
              {t('claim.anotherClaim')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Claim form ─────────────────────────────────────────────────────────────
  return (
    <div className="ff-card-framed mc-card fade-in">
      <div className="mc-header">
        <div className="mc-header-lead">
          <div className="mc-header-icon">
            <Hammer size={20} />
          </div>
          <div>
            <h3 className="mc-title">{t('claim.title')}</h3>
            <p className="mc-sub">{t('claim.sub')}</p>
          </div>
        </div>
        <button
          type="button"
          className="ff-btn-secondary mc-close-btn"
          onClick={onClose}
          title={t('claim.hideTip')}
        >
          <X size={14} />
        </button>
      </div>

      {/* Picker */}
      <div
        className="mc-picker"
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropdownOpen(false);
        }}
      >
        <div className="mc-picker-main">
          <div className="mc-search-wrap">
            <Search size={14} className="mc-search-icon" />
            <input
              ref={searchRef}
              type="text"
              className="mc-search-input"
              placeholder={t('claim.searchPlaceholder')}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setDropdownOpen(true);
                setActiveIndex(0);
              }}
              onFocus={() => setDropdownOpen(true)}
              onKeyDown={handleSearchKeyDown}
              aria-label={t('claim.searchAria')}
            />
            {query && (
              <button
                type="button"
                className="mc-search-clear"
                onClick={() => {
                  setQuery('');
                  searchRef.current?.focus();
                }}
                title={t('claim.clearTip')}
              >
                <X size={12} />
              </button>
            )}
            {dropdownOpen && suggestions.length > 0 && (
              <div className="mc-dropdown">
                {suggestions.map((item, i) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`mc-option ${i === activeIndex ? 'is-active' : ''}`}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => handleAddFromDropdown(item)}
                  >
                    <span className="mc-option-name">{highlight(itemName(item.name), query)}</span>
                    <span className="mc-option-meta">
                      {item.remaining > 0 && (
                        <span className="mc-option-need">
                          {t('claim.needed', { n: formatNumber(item.remaining) })}
                        </span>
                      )}
                      <span className="mc-option-price">
                        {item.unitPrice ? `${formatNumber(item.unitPrice)} G` : '—'}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {dropdownOpen && suggestions.length === 0 && (
              <div className="mc-dropdown">
                <div className="mc-no-results">{t('claim.noResults', { query })}</div>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Entries */}
      {entries.length === 0 ? (
        <div className="mc-empty">
          <Sparkles size={22} />
          <span className="mc-empty-title">{t('claim.emptyTitle')}</span>
          <span className="mc-empty-sub">{t('claim.emptySub')}</span>
        </div>
      ) : (
        <div className="mc-entries">
          {priced.map(({ entry, item }) => {
            const lineTotal = item.unitPrice ? item.unitPrice * entry.qty : 0;
            const coverage = item.remaining > 0 ? Math.min(1, entry.qty / item.remaining) : null;
            const coversAll = coverage !== null && coverage >= 1;
            const cap = capOf(entry.id);
            return (
              <div
                key={entry.id}
                className={`mc-entry ${justAddedId === entry.id ? 'is-just-added' : ''}`}
              >
                <div className="mc-entry-main">
                  <div className="mc-entry-name-wrap">
                    <span className="mc-entry-name">{itemName(item.name)}</span>
                    <span className="mc-entry-unit">
                      @ {item.unitPrice ? `${formatNumber(item.unitPrice)} G` : t('claim.priceTbd')}
                    </span>
                  </div>

                  <span className="mc-stack-label" title={t('claim.stackTip')}>
                    {stackLabel(entry.qty)}
                  </span>

                  <div className="mc-entry-qty">
                    <button
                      type="button"
                      className="ff-btn-secondary mc-qty-btn"
                      onClick={() => changeQty(entry.id, -1)}
                      title={t('claim.decrease')}
                    >
                      <Minus size={10} />
                    </button>
                    <input
                      type="number"
                      className="mc-qty-input is-entry"
                      min="1"
                      max={trusted || !Number.isFinite(cap) ? undefined : cap}
                      value={entry.qty}
                      onChange={(e) => setEntryQty(entry.id, parseInt(e.target.value, 10))}
                      aria-label={t('claim.qtyAria', { name: itemName(item.name) })}
                    />
                    <button
                      type="button"
                      className="ff-btn-secondary mc-qty-btn"
                      onClick={() => changeQty(entry.id, 1)}
                      title={t('claim.increase')}
                    >
                      <Plus size={10} />
                    </button>
                  </div>

                  <div className="mc-entry-total">
                    <span key={lineTotal} className="mc-entry-total-value">
                      {item.unitPrice ? formatNumber(lineTotal) : '—'}
                    </span>
                    {item.unitPrice && <span className="gil-coin mc-coin">G</span>}
                  </div>

                  <button
                    type="button"
                    className="mc-remove-btn"
                    onClick={() => removeEntry(entry.id)}
                    title={t('claim.remove')}
                  >
                    <X size={13} />
                  </button>
                </div>

                {coverage !== null && (
                  <div className="mc-entry-coverage">
                    <div className="mc-bar">
                      <div
                        className={`mc-bar-fill ${coversAll ? 'is-full' : ''}`}
                        style={{ width: `${Math.round(coverage * 100)}%` }}
                      />
                    </div>
                    <span className={`mc-coverage-label ${coversAll ? 'is-full' : ''}`}>
                      {coversAll ? (
                        <>
                          <Check size={10} /> {t('claim.coversAll')}
                        </>
                      ) : (
                        <>
                          <Hammer size={10} />{' '}
                          {t('claim.coveragePct', {
                            pct: Math.round(coverage * 100),
                            n: formatNumber(item.remaining),
                          })}
                        </>
                      )}
                    </span>
                    {!coversAll && (
                      <button
                        type="button"
                        className="mc-coverage-fill"
                        onClick={() => setEntryQty(entry.id, item.remaining)}
                      >
                        {t('claim.fillNeed')}
                      </button>
                    )}
                    <button
                      type="button"
                      className="mc-coverage-fill"
                      onClick={() => setEntryQty(entry.id, maxClaimQty(item.remaining))}
                      title={t('claim.claimMaxTip', { n: formatNumber(maxClaimQty(item.remaining)) })}
                    >
                      {t('claim.claimMax')}
                    </button>
                  </div>
                )}
                {/* Only reachable for trusted crafters — everyone else is clamped */}
                {entry.qty > cap && (
                  <div className="ff-alert ff-alert-warning cc-alert mc-over-max">
                    <AlertTriangle size={14} />
                    <span>{t('claim.overMaxWarn')}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Payout footer */}
      {entries.length > 0 && (
        <div className="mc-footer fade-in">
          <div className="mc-footer-total">
            {activeBonus && (
              <div className="mc-bonus-breakdown">
                <div className="mc-bonus-row">
                  <span className="mc-bonus-row-label">{t('common.subtotal')}</span>
                  <span className="mc-bonus-row-value">
                    {formatNumber(totalPayout)} G
                  </span>
                </div>
                <div className="mc-bonus-row is-bonus">
                  <span className="mc-bonus-row-label">
                    <Tag size={11} /> {t('claim.bulkBonus', { pct: bonusPct })}
                  </span>
                  <span className="mc-bonus-row-value">+{formatNumber(bonusAmount)} G</span>
                </div>
              </div>
            )}
            <span className="mc-footer-label">
              {unpricedCount > 0 ? t('claim.estimatedPayout') : t('claim.yourPayout')}
            </span>
            <div className="gil-price mc-footer-amount" key={finalPayout}>
              <span>{formatNumber(animatedTotal)}</span>
              <span className="gil-coin mc-coin-lg">G</span>
            </div>
            <span className="mc-footer-meta">
              {t('units.material', { count: entries.length, n: formatNumber(entries.length) })} ·{' '}
              {t('units.unit', { count: totalUnits, n: formatNumber(totalUnits) })}
              {activeBonus && ` · ${t('claim.includesBonus', { pct: bonusPct })}`}
              {unpricedCount > 0 && ` · ${t('claim.unpricedSuffix', { count: unpricedCount })}`}
            </span>
          </div>
        </div>
      )}

      {/* Nickname + submit */}
      <div className="cc-submit">
        {error && (
          <div className="ff-alert ff-alert-warning cc-alert">
            <X size={14} />
            <span>{error}</span>
          </div>
        )}
        <div className="form-group cc-nickname-group">
          <label className="form-label cc-nickname-label" htmlFor="cc-nickname">
            {t('claim.nicknameLabel')} <span className="cc-required">*</span>
          </label>
          <input
            id="cc-nickname"
            type="text"
            className="form-input cc-nickname-input"
            placeholder={t('common.exampleName')}
            value={nickname}
            maxLength={60}
            onChange={(e) => setNickname(e.target.value)}
            autoComplete="off"
          />
          <span className="cc-nickname-hint">{t('claim.nicknameHint')}</span>
        </div>
        <div className="cc-submit-actions">
          <button
            type="button"
            className="ff-btn cc-submit-btn"
            onClick={handleSubmit}
            disabled={!canSubmit}
            title={
              entries.length === 0
                ? t('claim.submitDisabledTip')
                : t('claim.submitTip')
            }
          >
            {submitting ? <Sparkles size={14} className="spin" /> : <Send size={14} />}
            {submitting ? t('claim.sending') : t('claim.send')}
          </button>
          <button
            type="button"
            className="ff-btn-secondary"
            onClick={roundUpToStacks}
            disabled={entries.length === 0 || submitting}
            title={t('claim.roundUpTip')}
          >
            <Boxes size={14} />
            {t('claim.roundUp')}
          </button>
          <button
            type="button"
            className="ff-btn-secondary mc-clear-btn"
            onClick={resetForm}
            disabled={submitting}
          >
            <Trash2 size={14} />
            {t('claim.clear')}
          </button>
        </div>
      </div>

      {/* Bulk bonus guide */}
      {bonusTiers.length > 0 && (
        <div className="mc-bonus-guide">
          <div className="mc-bonus-guide-head">
            <div className="mc-bonus-guide-title">
              <Tag size={12} /> {t('claim.bonusGuide')}
            </div>
            <span className="mc-bonus-guide-count">
              {t('claim.itemsCount')} <strong>{formatNumber(totalUnits)}</strong>
            </span>
          </div>
          <div className="mc-bonus-list">
            {bonusTiers.map((d) => {
              const isCurrent = activeBonus?.threshold === d.threshold;
              return (
                <div
                  key={d.id}
                  className={`mc-bonus-chip ${isCurrent ? 'is-current' : ''}`}
                >
                  <span>{t('claim.nPlusItems', { n: formatNumber(d.threshold) })}</span>
                  <span className="mc-bonus-chip-pct">{t('claim.pctBonus', { pct: Number(d.discountPercent) })}</span>
                  {isCurrent && <span className="mc-bonus-chip-active">{t('builder.activeChip')}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

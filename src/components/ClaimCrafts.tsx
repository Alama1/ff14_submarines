import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  Check,
  Copy,
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
  const [entries, setEntries] = useState<Entry[]>([]);
  const [query, setQuery] = useState('');
  const [qty, setQty] = useState(1);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [rawActiveIndex, setActiveIndex] = useState(0);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const [nickname, setNickname] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState<ApiCraftClaim | null>(null);
  const [copied, setCopied] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  // Suggestion order: what the workshop still needs first, then the rest
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;
    return [...filtered].sort((a, b) => {
      const aNeed = a.remaining > 0 ? 0 : 1;
      const bNeed = b.remaining > 0 ? 0 : 1;
      if (aNeed !== bNeed) return aNeed - bNeed;
      if (aNeed === 0 && b.remaining !== a.remaining) return b.remaining - a.remaining;
      return a.name.localeCompare(b.name);
    });
  }, [items, query]);

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
          e.id === item.id ? { ...e, qty: e.qty + safeQty } : e
        );
      }
      return [...prev, { id: item.id, qty: safeQty }];
    });
    setJustAddedId(item.id);
    window.setTimeout(() => setJustAddedId(null), 700);
    searchRef.current?.focus();
  };

  const handleAddFromDropdown = (item: ClaimItem) => {
    addEntry(item, qty);
    setQuery('');
    setDropdownOpen(true);
  };

  const changeQty = (id: string, delta: number) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, qty: Math.max(1, e.qty + delta) } : e))
    );
  };

  const setEntryQty = (id: string, value: number) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, qty: Math.max(1, Math.floor(value) || 1) } : e))
    );
  };

  const removeEntry = (id: string) => setEntries((prev) => prev.filter((e) => e.id !== id));

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
      const claim = await submitClaim({
        nickname: nickname.trim(),
        items: entries.map((e) => ({ materialId: e.id, quantity: e.qty })),
      });
      setSubmitted(claim);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit the claim. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyCode = () => {
    if (!submitted) return;
    navigator.clipboard.writeText(submitted.claimCode).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  };

  const resetForm = () => {
    setEntries([]);
    setNickname('');
    setError('');
    setSubmitted(null);
  };

  const activeItem = suggestions[activeIndex];

  // ─── Success view ───────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="ff-card-framed mc-card cc-card fade-in">
        <div className="cc-success">
          <div className="cc-success-icon">
            <Check size={34} />
          </div>
          <h3 className="cc-success-title">Claim Request Sent!</h3>
          <p className="cc-success-sub">
            The workshop will review your claim. Its status will change in{' '}
            <strong>My Claims</strong> once it is confirmed.
          </p>

          <div className="cc-success-code-block">
            <span className="cc-success-code-label">Your Claim Code</span>
            <button
              type="button"
              className="cc-success-code-btn"
              onClick={handleCopyCode}
              title="Click to copy"
            >
              {submitted.claimCode}
              {copied ? <Check size={18} /> : <Copy size={18} />}
            </button>
            <span className="cc-success-hint">
              Save this code — it is the only way to track and manage your claim.
              Sending it to <strong>@Alamai</strong> on Discord speeds up the confirmation!
            </span>
          </div>

          <div className="cc-success-payout">
            <span className="cc-success-payout-label">Payout</span>
            <span className="gil-price cc-success-payout-amount">
              <span>{formatNumber(submitted.total)}</span>
              <span className="gil-coin mc-coin-lg">G</span>
            </span>
            {Number(submitted.bonusPct) > 0 && (
              <span className="cc-success-payout-meta">
                incl. +{Number(submitted.bonusPct)}% bulk bonus
              </span>
            )}
            {unpricedCount > 0 && (
              <span className="cc-success-payout-meta">
                final total will be confirmed by @Alamai
              </span>
            )}
          </div>

          <div className="cc-success-actions">
            <button
              type="button"
              className="ff-btn"
              onClick={() => onClaimed(submitted.claimCode)}
            >
              <Hammer size={14} />
              View My Claims
            </button>
            <button type="button" className="ff-btn-secondary" onClick={resetForm}>
              Make Another Claim
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
            <h3 className="mc-title">Claim Some Crafts</h3>
            <p className="mc-sub">
              Pick what you will craft or deliver and send a claim request — the workshop
              confirms it, then you craft and get paid.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="ff-btn-secondary mc-close-btn"
          onClick={onClose}
          title="Hide the claim form"
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
              placeholder='Type a material — try "cobalt"…'
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setDropdownOpen(true);
                setActiveIndex(0);
              }}
              onFocus={() => setDropdownOpen(true)}
              onKeyDown={handleSearchKeyDown}
              aria-label="Search material"
            />
            {query && (
              <button
                type="button"
                className="mc-search-clear"
                onClick={() => {
                  setQuery('');
                  searchRef.current?.focus();
                }}
                title="Clear search"
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
                    <span className="mc-option-name">{highlight(item.name, query)}</span>
                    <span className="mc-option-meta">
                      {item.remaining > 0 && (
                        <span className="mc-option-need">
                          {formatNumber(item.remaining)} needed
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
                <div className="mc-no-results">No materials match “{query}”.</div>
              </div>
            )}
          </div>

          <div className="mc-qty-control">
            <button
              type="button"
              className="ff-btn-secondary mc-qty-btn"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              title="Decrease quantity"
            >
              <Minus size={12} />
            </button>
            <input
              type="number"
              className="mc-qty-input"
              min="1"
              value={qty}
              onChange={(e) => setQty(Math.max(1, Math.floor(parseInt(e.target.value, 10)) || 1))}
              aria-label="Quantity"
            />
            <button
              type="button"
              className="ff-btn-secondary mc-qty-btn"
              onClick={() => setQty((q) => q + 1)}
              title="Increase quantity"
            >
              <Plus size={12} />
            </button>
          </div>

          <button
            type="button"
            className="ff-btn mc-fill-btn"
            disabled={!activeItem || activeItem.remaining <= 0}
            onClick={() => activeItem && setQty(activeItem.remaining)}
            title="Set quantity to the full amount the workshop still needs"
          >
            Fill need
          </button>
        </div>
      </div>

      {/* Entries */}
      {entries.length === 0 ? (
        <div className="mc-empty">
          <Sparkles size={22} />
          <span className="mc-empty-title">Nothing added yet</span>
          <span className="mc-empty-sub">
            Search above and hit Enter — your claim and its payout add up live down here.
          </span>
        </div>
      ) : (
        <div className="mc-entries">
          {priced.map(({ entry, item }) => {
            const lineTotal = item.unitPrice ? item.unitPrice * entry.qty : 0;
            const coverage = item.remaining > 0 ? Math.min(1, entry.qty / item.remaining) : null;
            const coversAll = coverage !== null && coverage >= 1;
            return (
              <div
                key={entry.id}
                className={`mc-entry ${justAddedId === entry.id ? 'is-just-added' : ''}`}
              >
                <div className="mc-entry-main">
                  <div className="mc-entry-name-wrap">
                    <span className="mc-entry-name">{item.name}</span>
                    <span className="mc-entry-unit">
                      @ {item.unitPrice ? `${formatNumber(item.unitPrice)} G` : 'price TBD'}
                    </span>
                  </div>

                  <div className="mc-entry-qty">
                    <button
                      type="button"
                      className="ff-btn-secondary mc-qty-btn"
                      onClick={() => changeQty(entry.id, -1)}
                      title="Decrease"
                    >
                      <Minus size={10} />
                    </button>
                    <input
                      type="number"
                      className="mc-qty-input is-entry"
                      min="1"
                      value={entry.qty}
                      onChange={(e) => setEntryQty(entry.id, parseInt(e.target.value, 10))}
                      aria-label={`Quantity of ${item.name}`}
                    />
                    <button
                      type="button"
                      className="ff-btn-secondary mc-qty-btn"
                      onClick={() => changeQty(entry.id, 1)}
                      title="Increase"
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
                    title="Remove"
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
                          <Check size={10} /> covers the whole need
                        </>
                      ) : (
                        <>
                          <Hammer size={10} /> {Math.round(coverage * 100)}% of{' '}
                          {formatNumber(item.remaining)} needed
                        </>
                      )}
                    </span>
                    {!coversAll && (
                      <button
                        type="button"
                        className="mc-coverage-fill"
                        onClick={() => setEntryQty(entry.id, item.remaining)}
                      >
                        Fill need
                      </button>
                    )}
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
                  <span className="mc-bonus-row-label">Subtotal</span>
                  <span className="mc-bonus-row-value">
                    {formatNumber(totalPayout)} G
                  </span>
                </div>
                <div className="mc-bonus-row is-bonus">
                  <span className="mc-bonus-row-label">
                    <Tag size={11} /> Bulk Bonus ({bonusPct}%)
                  </span>
                  <span className="mc-bonus-row-value">+{formatNumber(bonusAmount)} G</span>
                </div>
              </div>
            )}
            <span className="mc-footer-label">
              {unpricedCount > 0 ? 'Estimated payout' : 'Your payout'}
            </span>
            <div className="gil-price mc-footer-amount" key={finalPayout}>
              <span>{formatNumber(animatedTotal)}</span>
              <span className="gil-coin mc-coin-lg">G</span>
            </div>
            <span className="mc-footer-meta">
              {formatNumber(entries.length)} material{entries.length !== 1 ? 's' : ''} ·{' '}
              {formatNumber(totalUnits)} unit{totalUnits !== 1 ? 's' : ''}
              {activeBonus && ` · includes +${bonusPct}% bulk bonus`}
              {unpricedCount > 0 &&
                ` · ${unpricedCount} without price — final total confirmed by @Alamai`}
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
            Your Nickname <span className="cc-required">*</span>
          </label>
          <input
            id="cc-nickname"
            type="text"
            className="form-input cc-nickname-input"
            placeholder="e.g. cobalt_king"
            value={nickname}
            maxLength={60}
            onChange={(e) => setNickname(e.target.value)}
            autoComplete="off"
          />
          <span className="cc-nickname-hint">
            Used to show who claimed what on the shopping list. Just copy your Discord
            username from any chat — that's all we need!
          </span>
        </div>
        <div className="cc-submit-actions">
          <button
            type="button"
            className="ff-btn cc-submit-btn"
            onClick={handleSubmit}
            disabled={!canSubmit}
            title={
              entries.length === 0
                ? 'Add at least one material first'
                : 'Send the claim request to the workshop'
            }
          >
            {submitting ? <Sparkles size={14} className="spin" /> : <Send size={14} />}
            {submitting ? 'Sending…' : 'Send Claim Request'}
          </button>
          <button
            type="button"
            className="ff-btn-secondary mc-clear-btn"
            onClick={resetForm}
            disabled={submitting}
          >
            <Trash2 size={14} />
            Clear
          </button>
        </div>
      </div>

      {/* Bulk bonus guide */}
      {bonusTiers.length > 0 && (
        <div className="mc-bonus-guide">
          <div className="mc-bonus-guide-head">
            <div className="mc-bonus-guide-title">
              <Tag size={12} /> Bulk Bonus Guide
            </div>
            <span className="mc-bonus-guide-count">
              Current Items Count: <strong>{formatNumber(totalUnits)}</strong>
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
                  <span>{formatNumber(d.threshold)}+ Items:</span>
                  <span className="mc-bonus-chip-pct">+{Number(d.discountPercent)}% Bonus</span>
                  {isCurrent && <span className="mc-bonus-chip-active">★ Active</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { itemName } from '../itemNames';
import {
  AlertCircle,
  Check,
  CheckCircle,
  Copy,
  Hammer,
  History,
  RefreshCw,
  Search,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import {
  cancelClaim,
  completeClaim,
  lookupClaim,
} from '../api/endpoints';
import { ApiError } from '../api/client';
import type { ApiCraftClaim, CraftClaimStatus } from '../api/types';
import { formatNumber } from '../utils/format';
import {
  addRecentClaimCode,
  getRecentClaimCodes,
  removeRecentClaimCode,
} from '../utils/orderCodes';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import './MyClaims.css';

const CLAIM_FLOW: CraftClaimStatus[] = ['pending', 'confirmed', 'completed'];

function StatusBadge({ status }: { status: CraftClaimStatus }) {
  const { t } = useTranslation();
  return <span className={`my-status-badge my-status-${status}`}>{t(`claimStatus.${status}`)}</span>;
}

function StatusStepper({ status }: { status: CraftClaimStatus }) {
  const { t } = useTranslation();
  if (status === 'cancelled') {
    return (
      <div className="my-cancelled-note">
        <XCircle size={14} />
        <span>{t('claims.cancelledNote')}</span>
      </div>
    );
  }
  const currentIdx = CLAIM_FLOW.indexOf(status);
  return (
    <div className="my-stepper">
      {CLAIM_FLOW.map((step, i) => (
        <div key={step} className="my-step-item">
          <span
            className={`my-step-pill ${i < currentIdx ? 'is-done' : ''} ${i === currentIdx ? 'is-current' : ''}`}
          >
            {i < currentIdx ? <Check size={10} /> : null}
            {t(`claimStatus.${step}`)}
          </span>
          {i < CLAIM_FLOW.length - 1 && (
            <span className={`my-step-connector ${i < currentIdx ? 'is-active' : ''}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function ClaimCard({
  claim,
  busy,
  onComplete,
  onCancel,
}: {
  claim: ApiCraftClaim;
  busy: boolean;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const bonusPct = Number(claim.bonusPct) || 0;
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(claim.claimCode).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="ff-card-framed my-card fade-in">
      {/* Header */}
      <div className="my-card-header">
        <div className="my-card-id-block">
          <span className="my-card-code-label">{t('claims.codeLabel')}</span>
          <button
            type="button"
            className="my-card-code"
            onClick={handleCopy}
            title={t('common.copyTip')}
          >
            {claim.claimCode}
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
        <div className="my-card-status-block">
          <StatusBadge status={claim.status} />
          <span className="my-card-nickname" title={t('claims.nicknameTip')}>
            <Hammer size={11} /> {claim.nickname}
          </span>
        </div>
      </div>

      <StatusStepper status={claim.status} />

      {/* Items */}
      <div className="my-items">
        {claim.items.map((item) => (
          <div key={item.id} className="my-item-row">
            <div className="my-item-name-wrap">
              <span className="my-item-name">{itemName(item.materialName)}</span>
              <span className="my-item-unit">
                {formatNumber(item.quantity)} × {formatNumber(item.unitPrice)} G
              </span>
            </div>
            <span className="my-item-total">
              {formatNumber(item.lineTotal)} <span className="gil-coin my-coin">G</span>
            </span>
          </div>
        ))}
      </div>

      {/* Payout summary */}
      <div className="my-pricing">
        {bonusPct > 0 && (
          <>
            <div className="my-pricing-row">
              <span>{t('common.subtotal')}</span>
              <span>{formatNumber(claim.subtotal)} G</span>
            </div>
            <div className="my-pricing-row is-bonus">
              <span>{t('claim.bulkBonus', { pct: bonusPct })}</span>
              <span>+{formatNumber(claim.bonusAmount)} G</span>
            </div>
          </>
        )}
        <div className="my-pricing-total">
          <span className="my-pricing-total-label">{t('claim.payout')}</span>
          <span className="gil-price my-pricing-amount">
            <span>{formatNumber(claim.total)}</span>
            <span className="gil-coin my-coin-lg">G</span>
          </span>
        </div>
      </div>

      {/* Meta */}
      <div className="my-meta">
        <div className="my-meta-item">
          <span className="my-meta-label">{t('claims.submitted')}</span>
          <span className="my-meta-value">{new Date(claim.createdAt).toLocaleString(i18n.language)}</span>
        </div>
        {claim.confirmedAt && (
          <div className="my-meta-item">
            <span className="my-meta-label">{t('claims.confirmed')}</span>
            <span className="my-meta-value">{new Date(claim.confirmedAt).toLocaleString(i18n.language)}</span>
          </div>
        )}
        {claim.completedAt && (
          <div className="my-meta-item">
            <span className="my-meta-label">{t('claims.completed')}</span>
            <span className="my-meta-value">{new Date(claim.completedAt).toLocaleString(i18n.language)}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      {(claim.status === 'pending' || claim.status === 'confirmed') && (
        <div className="my-actions">
          {claim.status === 'pending' ? (
            <div className="my-actions-note">{t('claims.waitingNote')}</div>
          ) : (
            <button
              type="button"
              className="ff-btn my-complete-btn"
              onClick={onComplete}
              disabled={busy}
              title={t('claims.completeTip')}
            >
              <CheckCircle size={14} />
              {t('claims.markCompleted')}
            </button>
          )}
          <button
            type="button"
            className="ff-btn-danger my-cancel-btn"
            onClick={onCancel}
            disabled={busy}
            title={t('claims.cancelTip')}
          >
            <X size={14} />
            {t('claims.cancelClaim')}
          </button>
        </div>
      )}
      {claim.status === 'completed' && (
        <div className="my-actions-note is-done">
          <CheckCircle size={13} /> {t('claims.doneNote')}
        </div>
      )}
    </div>
  );
}

export default function MyClaims({
  initialCode,
  onClose,
}: {
  initialCode?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [codeInput, setCodeInput] = useState(initialCode ?? '');
  const [claim, setClaim] = useState<ApiCraftClaim | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recentCodes, setRecentCodes] = useState<string[]>(getRecentClaimCodes);

  const lookupSeq = useRef(0);

  const handleLookup = useCallback(async (rawCode: string) => {
    const code = rawCode.trim().toUpperCase();
    if (!code) return;
    lookupSeq.current += 1;
    setLoading(true);
    setError('');
    try {
      const result = await lookupClaim(code);
      setClaim(result);
      addRecentClaimCode(code);
      setRecentCodes(getRecentClaimCodes());
    } catch (e: unknown) {
      setClaim(null);
      setError(
        e instanceof ApiError
          ? e.status === 404
            ? t('claims.notFound', { code })
            : e.message
          : t('claims.lookupFailed')
      );
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  // Auto-lookup when arriving from a freshly submitted claim.
  const autoLookupDone = useRef(false);
  useEffect(() => {
    if (!initialCode || autoLookupDone.current) return;
    autoLookupDone.current = true;
    handleLookup(initialCode);
  }, [initialCode, handleLookup]);

  const handleRemoveRecent = (code: string) => {
    removeRecentClaimCode(code);
    setRecentCodes(getRecentClaimCodes());
  };

  const handleAction = async (action: 'complete' | 'cancel') => {
    if (!claim) return;
    setBusy(true);
    setError('');
    try {
      const updated =
        action === 'complete' ? await completeClaim(claim.claimCode) : await cancelClaim(claim.claimCode);
      setClaim(updated);
    } catch (e: unknown) {
      setError(
        e instanceof ApiError ? e.message : t('claims.actionFailed')
      );
    } finally {
      setBusy(false);
    }
  };

  // Silent status refresh while the panel stays open.
  useAutoRefresh(() => {
    if (claim) {
      const seq = ++lookupSeq.current;
      lookupClaim(claim.claimCode)
        .then((result) => {
          if (lookupSeq.current === seq) setClaim(result);
        })
        .catch(() => {
          // keep the last known state on transient failures
        });
    }
  }, loading || busy);

  return (
    <div className="my-panel fade-in">
      {/* Header */}
      <div className="my-panel-head">
        <div>
          <h3 className="my-panel-title">
            <Hammer size={18} /> {t('claims.title')}
          </h3>
          <p className="my-panel-sub">{t('claims.sub')}</p>
        </div>
        <button
          type="button"
          className="ff-btn-secondary my-close-btn"
          onClick={onClose}
          title={t('crafters.hideMyClaims')}
        >
          <X size={14} />
        </button>
      </div>

      {/* Lookup form */}
      <div className="ff-card-framed my-lookup-card">
        <form
          className="my-lookup-form"
          onSubmit={(e) => {
            e.preventDefault();
            handleLookup(codeInput);
          }}
        >
          <div className="form-group my-code-group">
            <label className="form-label my-code-label">{t('claims.codeLabel')}</label>
            <input
              type="text"
              className="form-input my-code-input"
              placeholder={t('claims.codePlaceholder')}
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              maxLength={24}
            />
          </div>
          <button
            type="submit"
            className="ff-btn my-track-btn"
            disabled={loading || !codeInput.trim()}
          >
            {loading ? <RefreshCw size={15} className="spin" /> : <Search size={15} />}
            {loading ? t('common.searching') : t('claims.track')}
          </button>
        </form>

        {/* Recent codes */}
        {recentCodes.length > 0 && (
          <div className="my-recent">
            <span className="my-recent-label">
              <History size={11} /> {t('claims.recentLabel')}
            </span>
            <div className="my-recent-grid">
              {recentCodes.slice(0, 4).map((code) => (
                <span
                  key={code}
                  className={`my-recent-chip ${claim?.claimCode === code ? 'is-active' : ''}`}
                >
                  <button
                    type="button"
                    className="my-recent-code-btn"
                    onClick={() => {
                      setCodeInput(code);
                      handleLookup(code);
                    }}
                  >
                    {code}
                  </button>
                  <button
                    type="button"
                    className="my-recent-remove-btn"
                    title={t('common.forgetTip')}
                    onClick={() => handleRemoveRecent(code)}
                  >
                    <Trash2 size={11} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="ff-alert ff-alert-warning my-alert">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {loading && !claim && (
        <div className="my-loading">
          <RefreshCw size={30} className="spin my-loading-spinner" />
          <p className="my-loading-text">{t('claims.loadingText')}</p>
        </div>
      )}

      {claim && !loading && (
        <ClaimCard
          claim={claim}
          busy={busy}
          onComplete={() => handleAction('complete')}
          onCancel={() => handleAction('cancel')}
        />
      )}

      {!claim && !loading && !error && (
        <div className="my-empty">
          <Hammer size={32} className="my-empty-icon" />
          <div className="my-empty-title-block">
            <span className="my-empty-title">{t('claims.emptyTitle')}</span>
            <span className="my-empty-sub">{t('claims.emptySub')}</span>
          </div>
        </div>
      )}
    </div>
  );
}

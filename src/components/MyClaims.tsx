import { useCallback, useEffect, useRef, useState } from 'react';
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
  return <span className={`my-status-badge my-status-${status}`}>{status}</span>;
}

function StatusStepper({ status }: { status: CraftClaimStatus }) {
  if (status === 'cancelled') {
    return (
      <div className="my-cancelled-note">
        <XCircle size={14} />
        <span>This claim was cancelled — the materials are back on the shopping list.</span>
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
            {step}
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
          <span className="my-card-code-label">Claim Code</span>
          <button
            type="button"
            className="my-card-code"
            onClick={handleCopy}
            title="Click to copy"
          >
            {claim.claimCode}
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
        <div className="my-card-status-block">
          <StatusBadge status={claim.status} />
          <span className="my-card-nickname" title="Your Discord nickname">
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
              <span className="my-item-name">{item.materialName}</span>
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
              <span>Subtotal</span>
              <span>{formatNumber(claim.subtotal)} G</span>
            </div>
            <div className="my-pricing-row is-bonus">
              <span>Bulk Bonus ({bonusPct}%)</span>
              <span>+{formatNumber(claim.bonusAmount)} G</span>
            </div>
          </>
        )}
        <div className="my-pricing-total">
          <span className="my-pricing-total-label">Payout</span>
          <span className="gil-price my-pricing-amount">
            <span>{formatNumber(claim.total)}</span>
            <span className="gil-coin my-coin-lg">G</span>
          </span>
        </div>
      </div>

      {/* Meta */}
      <div className="my-meta">
        <div className="my-meta-item">
          <span className="my-meta-label">Submitted</span>
          <span className="my-meta-value">{new Date(claim.createdAt).toLocaleString()}</span>
        </div>
        {claim.confirmedAt && (
          <div className="my-meta-item">
            <span className="my-meta-label">Confirmed</span>
            <span className="my-meta-value">{new Date(claim.confirmedAt).toLocaleString()}</span>
          </div>
        )}
        {claim.completedAt && (
          <div className="my-meta-item">
            <span className="my-meta-label">Completed</span>
            <span className="my-meta-value">{new Date(claim.completedAt).toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      {(claim.status === 'pending' || claim.status === 'confirmed') && (
        <div className="my-actions">
          {claim.status === 'pending' ? (
            <div className="my-actions-note">
              Waiting for the workshop to confirm this claim — the payout counts only after
              confirmation.
            </div>
          ) : (
            <button
              type="button"
              className="ff-btn my-complete-btn"
              onClick={onComplete}
              disabled={busy}
              title="You delivered the materials — mark this claim as completed"
            >
              <CheckCircle size={14} />
              Mark as Completed
            </button>
          )}
          <button
            type="button"
            className="ff-btn-danger my-cancel-btn"
            onClick={onCancel}
            disabled={busy}
            title="Give up this claim — the materials return to the shopping list"
          >
            <X size={14} />
            Cancel Claim
          </button>
        </div>
      )}
      {claim.status === 'completed' && (
        <div className="my-actions-note is-done">
          <CheckCircle size={13} /> Completed — nice work, crafter!
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
            ? `No claim found with code "${code}". Double-check the code and try again.`
            : e.message
          : 'Failed to look up the claim. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

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
        e instanceof ApiError ? e.message : 'The action failed. Please try again.'
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
            <Hammer size={18} /> My Claims
          </h3>
          <p className="my-panel-sub">
            Enter the claim code you received when submitting your claim to check its status,
            cancel it or mark it as completed.
          </p>
        </div>
        <button
          type="button"
          className="ff-btn-secondary my-close-btn"
          onClick={onClose}
          title="Hide my claims"
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
            <label className="form-label my-code-label">Claim Code</label>
            <input
              type="text"
              className="form-input my-code-input"
              placeholder="e.g. CLM-7K9P-A2BC-DEF3"
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
            {loading ? 'Searching…' : 'Track Claim'}
          </button>
        </form>

        {/* Recent codes */}
        {recentCodes.length > 0 && (
          <div className="my-recent">
            <span className="my-recent-label">
              <History size={11} /> Your recent claims:
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
                    title="Forget this code"
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
          <p className="my-loading-text">Checking the claim ledger…</p>
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
            <span className="my-empty-title">No claim loaded yet</span>
            <span className="my-empty-sub">
              Submit a claim from “Claim Some Crafts” above to receive a code, then track it
              here. Your recent codes are remembered on this device.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

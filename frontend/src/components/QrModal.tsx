import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { Check, Copy, ExternalLink, Printer, QrCode as QrIcon, X } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, shortId } from '../lib/format';
import { useModalFocus } from '../lib/useModalFocus';

interface QrModalProps {
  claim: any;
  onClose: () => void;
  onOpenSlip?: () => void;
}

export function QrModal({ claim, onClose, onOpenSlip }: QrModalProps) {
  const verifyUrl = `${window.location.origin}/verify/${claim.id}`;
  const [qrCode, setQrCode] = useState('');
  const [copied, setCopied] = useState(false);
  const dialog = useModalFocus<HTMLDivElement>(onClose);

  useEffect(() => {
    let current = true;
    QRCode.toDataURL(verifyUrl, { margin: 1, width: 280 })
      .then(url => { if (current) setQrCode(url); })
      .catch(() => {});
    return () => { current = false; };
  }, [verifyUrl]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(verifyUrl);
      setCopied(true);
      toast.success('Verification link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy link');
    }
  };

  return createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-scrim/75 p-4 backdrop-blur-sm cursor-pointer"
    >
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Public discharge slip verification QR code"
        className="outline-none relative w-full max-w-md rounded-xl bg-paper text-ink shadow-2xl border border-rule cursor-auto overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-rule bg-bone px-5 py-3.5">
          <div className="flex items-center gap-2">
            <QrIcon size={16} className="text-pine" />
            <span className="font-serif text-base text-pine-deep font-bold">Public Verification QR Code</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded text-ink-soft hover:bg-rule/40 hover:text-ink transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 text-center space-y-4">
          <p className="text-xs text-ink-soft leading-relaxed">
            Scan this code with a phone camera to verify the authenticity and settlement figures of this discharge clearance.
          </p>

          <div className="flex justify-center my-4">
            {qrCode ? (
              <div className="p-3 bg-white rounded-lg border border-rule shadow-sm">
                <img
                  src={qrCode}
                  alt={`Verification QR code for claim ${shortId(claim.id)}`}
                  className="w-52 h-52 mx-auto"
                />
              </div>
            ) : (
              <div className="w-52 h-52 border border-rule rounded-lg flex items-center justify-center font-mono text-xs text-ink-soft bg-bone">
                Generating QR code…
              </div>
            )}
          </div>

          {/* Quick claim details badge */}
          <div className="bg-bone border border-rule rounded-lg p-3 text-xs font-mono text-left space-y-1">
            <div className="flex justify-between text-ink-soft">
              <span>Reference:</span>
              <span className="font-bold text-ink">{shortId(claim.id)}</span>
            </div>
            <div className="flex justify-between text-ink-soft">
              <span>Status:</span>
              <span className="font-bold text-pine">{claim.status}</span>
            </div>
            <div className="flex justify-between text-ink-soft">
              <span>Approved payout:</span>
              <span className="font-bold text-ink">{formatCurrency(claim.approved_amount)}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2 pt-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={copyLink}
                className="flex-1 btn btn-sm btn-secondary inline-flex items-center justify-center gap-1.5 py-2"
              >
                {copied ? <Check size={14} className="text-moss" /> : <Copy size={14} />}
                {copied ? 'Link Copied' : 'Copy Link'}
              </button>
              <a
                href={verifyUrl}
                target="_blank"
                rel="noreferrer"
                className="flex-1 btn btn-sm btn-secondary inline-flex items-center justify-center gap-1.5 py-2"
              >
                <ExternalLink size={14} /> Open Page
              </a>
            </div>

            {onOpenSlip && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSlip();
                }}
                className="w-full btn btn-sm btn-primary inline-flex items-center justify-center gap-1.5 py-2 mt-2"
              >
                <Printer size={14} /> View Full Printable Slip
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

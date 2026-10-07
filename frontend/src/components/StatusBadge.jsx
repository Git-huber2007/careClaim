const STYLES = {
  PENDING: 'bg-amber-400/10 text-amber-300 ring-amber-400/25',
  APPROVED: 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/25',
  PARTIAL: 'bg-sky-400/10 text-sky-300 ring-sky-400/25',
  DENIED: 'bg-rose-400/10 text-rose-300 ring-rose-400/25',
};

const DOT = {
  PENDING: 'bg-amber-300',
  APPROVED: 'bg-emerald-300',
  PARTIAL: 'bg-sky-300',
  DENIED: 'bg-rose-300',
};

const LABEL = { PENDING: 'Pending', APPROVED: 'Approved', PARTIAL: 'Partially Approved', DENIED: 'Denied' };

export default function StatusBadge({ status = 'PENDING', size = 'sm' }) {
  const s = STYLES[status] ? status : 'PENDING';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 ring-inset ${STYLES[s]} ${
        size === 'lg' ? 'px-3 py-1 text-sm' : 'px-2.5 py-0.5 text-xs'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[s]} ${s === 'PENDING' ? 'animate-pulse' : ''}`} />
      {LABEL[s]}
    </span>
  );
}

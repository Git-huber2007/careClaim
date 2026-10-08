import { cn } from '../lib/utils';

export function StatusStamp({ status }: { status: 'PENDING' | 'PROCESSING' | 'APPROVED' | 'PARTIAL' | 'DENIED' }) {
  const isApproved = status === 'APPROVED';
  const isPartial = status === 'PARTIAL';
  const isDenied = status === 'DENIED';
  const isPending = status === 'PENDING';
  const isProcessing = status === 'PROCESSING';

  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 border text-xs font-mono font-bold uppercase tracking-widest",
      isApproved && "border-moss text-moss rotate-[-2deg]",
      isPartial && "border-amber text-amber-ink rotate-[1deg]",
      isDenied && "border-vermilion text-vermilion rotate-[-3deg]",
      isPending && "border-ink-soft/30 text-ink-soft bg-paper",
      isProcessing && "border-phosphor text-pine-deep bg-phosphor/20 animate-pulse"
    )}>
      {status}
    </span>
  );
}

import ClaimUploader from '../components/ClaimUploader';

export default function NewClaimPage() {
  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-8 animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-300">Claim ingestion</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">Submit Discharge Bill</h1>
        <p className="mt-1 text-sm text-ink-400">
          Provide the patient, policy, diagnosis and itemized bill. The claim is queued as <span className="text-amber-300">Pending</span> until the agent runs.
        </p>
      </header>
      <ClaimUploader />
    </div>
  );
}

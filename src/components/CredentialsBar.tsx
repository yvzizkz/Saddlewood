const credentials = [
  { type: "General", roc: "ROC #305762" },
  { type: "HVAC", roc: "ROC #350714" },
  { type: "Electrical", roc: "ROC #350715" },
  { type: "Plumbing", roc: "ROC #350716" },
];

export function CredentialsBar() {
  return (
    <div className="bg-teal py-10 sm:py-14 px-4 sm:px-6 lg:px-12 grid grid-cols-2 lg:grid-cols-4 gap-px" role="region" aria-label="Contractor credentials">
      {credentials.map((cred, i) => (
        <div
          key={cred.type}
          className={`text-center py-6 ${
            i < credentials.length - 1 ? "lg:border-r lg:border-white/[0.08]" : ""
          }`}
        >
          <div className="text-[11px] tracking-[0.15em] uppercase text-stone/40 font-normal mb-1.5">
            {cred.type}
          </div>
          <div className="font-heading text-lg font-medium text-gold">{cred.roc}</div>
        </div>
      ))}
    </div>
  );
}

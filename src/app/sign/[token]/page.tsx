'use client';

import { use, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  FileText,
  ShieldCheck,
  Calendar,
  DollarSign,
  AlertCircle,
  RefreshCw,
  Printer,
  PenTool,
} from 'lucide-react';
import type { ContractItem } from '@/lib/contracts/types';

export default function ContractSignPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);

  const [contract, setContract] = useState<ContractItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [signedSuccess, setSignedSuccess] = useState(false);
  const [signatureMode, setSignatureMode] = useState<'draw' | 'type'>('type');

  // Canvas drawing state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    async function loadContract() {
      try {
        setLoading(true);
        const res = await fetch(`/api/contracts/${token}/sign`);
        const json = await res.json();
        if (!res.ok || !json.ok) {
          throw new Error(json.error || 'Contract agreement not found');
        }
        setContract(json.contract);
        setSignerName(json.contract.client_name || '');
        if (json.contract.status === 'signed') {
          setSignedSuccess(true);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error loading document');
      } finally {
        setLoading(false);
      }
    }
    loadContract();
  }, [token]);

  // Canvas drawing handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    setHasDrawn(true);
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasDrawn(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signerName.trim()) {
      alert('Please enter your full legal name.');
      return;
    }
    if (!agreed) {
      alert('Please check the acknowledgment box to confirm your agreement.');
      return;
    }

    try {
      setSubmitting(true);
      let signatureData = signerName.trim();
      if (signatureMode === 'draw' && canvasRef.current) {
        signatureData = canvasRef.current.toDataURL();
      }

      const res = await fetch(`/api/contracts/${token}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signerName: signerName.trim(),
          signerEmail: signerEmail.trim() || undefined,
          signatureData,
          agreed,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Failed to submit signature');
      }

      setContract(json.contract);
      setSignedSuccess(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-6 text-stone-600">
        <RefreshCw className="size-8 animate-spin text-[var(--color-teal)] mb-3" />
        <p className="font-semibold text-sm">Preparing legal agreement...</p>
      </div>
    );
  }

  if (error || !contract) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <div className="bg-white border border-stone-200 rounded-3xl p-8 max-w-md w-full text-center shadow-sm">
          <AlertCircle className="size-12 text-rose-500 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-stone-900 mb-2">Agreement Not Found</h1>
          <p className="text-sm text-stone-600 mb-4">
            {error || 'This contract link may have expired or is invalid.'}
          </p>
          <p className="text-xs text-stone-400">
            Please contact Saddlewood Contracting at (480) 555-0199 or info@saddlewoodcontracting.com.
          </p>
        </div>
      </div>
    );
  }

  const isAlreadySigned = contract.status === 'signed' || signedSuccess;

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 py-8 md:py-14 px-4 md:px-8">
      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        {/* Brand Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-stone-200 gap-4">
          <div>
            <span className="text-[11px] font-black uppercase tracking-widest text-[var(--color-teal)] bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200 inline-block mb-1.5">
              Saddlewood Contracting LLC
            </span>
            <h1
              style={{ fontFamily: 'var(--font-fraunces)' }}
              className="text-2xl md:text-3xl text-stone-900"
            >
              Construction Agreement &amp; Scope of Work
            </h1>
            <p className="text-xs text-stone-500 mt-1">
              Arizona ROC License #305762 · Commercial &amp; Residential Framing / Drywall
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`text-xs font-bold px-3 py-1 rounded-full border ${
                isAlreadySigned
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-amber-50 text-amber-800 border-amber-300'
              }`}
            >
              {isAlreadySigned ? '✓ Executed & Signed' : 'Ready for Signature'}
            </span>
            <button
              type="button"
              onClick={() => window.print()}
              className="p-2 border border-stone-200 rounded-xl bg-white hover:bg-stone-50 text-stone-600 text-xs font-semibold flex items-center gap-1 shadow-xs"
              title="Print document"
            >
              <Printer className="size-4" />
              <span className="hidden sm:inline">Print / Save PDF</span>
            </button>
          </div>
        </div>

        {/* Success Confirmation Banner */}
        {isAlreadySigned && (
          <div className="bg-emerald-950 text-emerald-100 rounded-3xl p-6 border border-emerald-800 shadow-md">
            <div className="flex items-start gap-4">
              <CheckCircle2 className="size-8 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-lg font-bold text-white mb-1">
                  Agreement Successfully Executed!
                </h2>
                <p className="text-xs text-emerald-200 leading-relaxed">
                  Thank you, <b>{contract.signed_by || signerName}</b>. This agreement was digitally signed and is now active. A copy has been filed with Saddlewood Contracting project administration.
                </p>
                <div className="mt-3 text-[11px] font-mono text-emerald-300">
                  Execution Timestamp: {contract.signed_at || new Date().toISOString()}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Project Key Details Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-xs">
            <div className="text-[10px] uppercase font-bold text-stone-400 mb-1 flex items-center gap-1">
              <FileText className="size-3 text-stone-500" /> Contract No.
            </div>
            <div className="text-sm font-bold text-stone-900 font-mono">
              {contract.contract_number}
            </div>
          </div>

          <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-xs">
            <div className="text-[10px] uppercase font-bold text-stone-400 mb-1 flex items-center gap-1">
              <DollarSign className="size-3 text-emerald-600" /> Contract Amount
            </div>
            <div className="text-base font-bold text-emerald-700 tabular-nums">
              ${contract.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-xs">
            <div className="text-[10px] uppercase font-bold text-stone-400 mb-1 flex items-center gap-1">
              <DollarSign className="size-3 text-amber-600" /> Deposit Due
            </div>
            <div className="text-base font-bold text-stone-900 tabular-nums">
              ${contract.deposit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-xs">
            <div className="text-[10px] uppercase font-bold text-stone-400 mb-1 flex items-center gap-1">
              <Calendar className="size-3 text-indigo-600" /> Warranty Term
            </div>
            <div className="text-sm font-bold text-stone-900">
              {contract.warranty_years} Years Express
            </div>
          </div>
        </div>

        {/* Legal Agreement Text Viewer */}
        <div className="bg-white border border-stone-200 rounded-3xl p-6 md:p-8 shadow-xs">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-stone-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400">
              Contract Terms &amp; Scope
            </h3>
            <span className="text-[11px] text-stone-500 font-medium">
              Project: {contract.project_name}
            </span>
          </div>

          <div className="prose prose-sm max-w-none text-stone-800 leading-relaxed font-sans text-xs md:text-sm whitespace-pre-wrap font-mono bg-stone-50 p-4 md:p-6 rounded-2xl border border-stone-200 max-h-[500px] overflow-y-auto">
            {contract.contract_text}
          </div>
        </div>

        {/* Digital Signature Execution Block */}
        {!isAlreadySigned ? (
          <form
            onSubmit={handleSubmit}
            className="bg-white border-2 border-[var(--color-teal)]/30 rounded-3xl p-6 md:p-8 shadow-sm flex flex-col gap-5"
          >
            <div>
              <h2 className="text-lg font-bold text-stone-900 mb-1 flex items-center gap-2">
                <PenTool className="size-5 text-[var(--color-teal)]" />
                Digital Signature Execution
              </h2>
              <p className="text-xs text-stone-500">
                Signing below constitutes a legally binding electronic agreement pursuant to Arizona Uniform Electronic Transactions Act (A.R.S. § 44-7001 et seq.).
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                  Signer Full Legal Name *
                </label>
                <input
                  type="text"
                  required
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="e.g. Mark Powell"
                  className="w-full text-sm px-4 py-2.5 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--color-teal)]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                  Signer Email Address (for copy)
                </label>
                <input
                  type="email"
                  value={signerEmail}
                  onChange={(e) => setSignerEmail(e.target.value)}
                  placeholder="mark@example.com"
                  className="w-full text-sm px-4 py-2.5 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--color-teal)]"
                />
              </div>
            </div>

            {/* Signature Input Mode */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                  Signature *
                </label>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setSignatureMode('type')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                      signatureMode === 'type'
                        ? 'bg-stone-900 text-white'
                        : 'bg-stone-100 text-stone-600'
                    }`}
                  >
                    Type Signature
                  </button>
                  <button
                    type="button"
                    onClick={() => setSignatureMode('draw')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                      signatureMode === 'draw'
                        ? 'bg-stone-900 text-white'
                        : 'bg-stone-100 text-stone-600'
                    }`}
                  >
                    Draw Signature
                  </button>
                </div>
              </div>

              {signatureMode === 'type' ? (
                <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl">
                  <div
                    style={{ fontFamily: 'var(--font-fraunces)' }}
                    className="text-2xl md:text-3xl text-stone-900 italic font-semibold border-b border-stone-300 pb-2"
                  >
                    {signerName.trim() || 'Your Name Appears Here'}
                  </div>
                  <span className="text-[10px] text-stone-400 block mt-1">
                    Typed electronic signature representation
                  </span>
                </div>
              ) : (
                <div className="border border-stone-300 rounded-2xl overflow-hidden bg-stone-50">
                  <canvas
                    ref={canvasRef}
                    width={500}
                    height={120}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    className="w-full h-[120px] bg-white cursor-crosshair touch-none"
                  />
                  <div className="p-2 bg-stone-100 border-t border-stone-200 flex items-center justify-between text-xs text-stone-500">
                    <span>Draw above using your finger or mouse</span>
                    <button
                      type="button"
                      onClick={clearCanvas}
                      className="text-stone-700 hover:text-stone-900 font-semibold"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Acknowledgment Checkbox */}
            <div className="pt-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  required
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="size-4 mt-0.5 rounded border-stone-300 text-[var(--color-teal)] focus:ring-[var(--color-teal)]"
                />
                <span className="text-xs text-stone-700 leading-relaxed font-medium">
                  I confirm that I am authorized to sign this agreement on behalf of the Property Owner / Client. I have reviewed and agree to all terms, payment milestones, scope of work, warranty conditions, and statutory Arizona ROC disclosures set forth above.
                </span>
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-4 rounded-2xl bg-[var(--color-teal)] text-white font-bold text-sm md:text-base hover:opacity-95 shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              {submitting ? (
                <>
                  <RefreshCw className="size-5 animate-spin" />
                  <span>Executing Agreement...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="size-5" />
                  <span>Execute &amp; Sign Agreement</span>
                </>
              )}
            </button>
          </form>
        ) : (
          /* Already Signed Card */
          <div className="bg-white border border-stone-200 rounded-3xl p-6 text-center shadow-xs">
            <ShieldCheck className="size-10 text-emerald-600 mx-auto mb-2" />
            <h3 className="text-base font-bold text-stone-900">
              Legally Executed Contract
            </h3>
            <p className="text-xs text-stone-500 max-w-sm mx-auto mt-1">
              Signed by <b>{contract.signed_by}</b> on {contract.signed_at?.slice(0, 10)}. For questions or change orders, contact Saddlewood Contracting at info@saddlewoodcontracting.com.
            </p>
          </div>
        )}

        {/* Footer */}
        <footer className="text-center text-xs text-stone-400 pt-6">
          Saddlewood Contracting LLC · Arizona Registrar of Contractors License #305762
        </footer>
      </div>
    </div>
  );
}

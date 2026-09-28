import { NextRequest, NextResponse } from 'next/server';
import { getContractsState, updateContract } from '@/lib/contracts/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const state = await getContractsState();
    const contract = state.contracts.find(
      (c) => c.id === id || c.contract_number === id || String(c.n) === id
    );

    if (!contract) {
      return NextResponse.json({ ok: false, error: 'Contract not found' }, { status: 404 });
    }

    // Return client-safe view of contract
    return NextResponse.json({
      ok: true,
      contract: {
        id: contract.id,
        contract_number: contract.contract_number,
        type: contract.type,
        client_name: contract.client_name,
        client_entity: contract.client_entity,
        project_name: contract.project_name,
        project_address: contract.project_address,
        amount: contract.amount,
        deposit: contract.deposit,
        scope: contract.scope,
        scope_details: contract.scope_details,
        warranty_years: contract.warranty_years,
        late_interest: contract.late_interest,
        date: contract.date,
        status: contract.status,
        contract_text: contract.contract_text,
        signed_at: contract.signed_at,
        signed_by: contract.signed_by,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { signerName, signerEmail, signatureData, agreed } = body;

    if (!signerName || !signerName.trim()) {
      return NextResponse.json({ ok: false, error: 'Signer legal name is required' }, { status: 400 });
    }

    if (!agreed) {
      return NextResponse.json({ ok: false, error: 'Must acknowledge terms of agreement' }, { status: 400 });
    }

    const state = await getContractsState();
    const contract = state.contracts.find(
      (c) => c.id === id || c.contract_number === id || String(c.n) === id
    );

    if (!contract) {
      return NextResponse.json({ ok: false, error: 'Contract not found' }, { status: 404 });
    }

    if (contract.status === 'signed') {
      return NextResponse.json({
        ok: true,
        contract,
        message: 'Contract is already signed.',
      });
    }

    const now = new Date();
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      'Unknown IP';
    const userAgent = request.headers.get('user-agent') || 'Unknown Device';

    const auditTrail = `Electronically executed by ${signerName.trim()} (${signerEmail || 'No email provided'}) on ${now.toISOString()} | IP: ${ip} | User-Agent: ${userAgent.slice(0, 80)}`;

    const updated = await updateContract(
      contract.id,
      {
        status: 'signed',
        signed_by: signerName.trim(),
        signed_at: now.toISOString(),
      },
      `client:${signerName.trim()}`
    );

    // Append signature block text if not already present
    if (updated && !updated.contract_text.includes('DIGITALLY SIGNED & EXECUTED')) {
      const signatureFooter = `\n\n=======================================================\nDIGITALLY SIGNED & EXECUTED\nSigner: ${signerName.trim()}\nTimestamp: ${now.toUTCString()}\nAudit Verification: ${auditTrail}\n=======================================================`;
      await updateContract(
        contract.id,
        {
          contract_text: updated.contract_text + signatureFooter,
        },
        'system'
      );
    }

    return NextResponse.json({
      ok: true,
      contract: updated,
      auditTrail,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

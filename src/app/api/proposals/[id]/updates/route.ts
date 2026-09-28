import { NextResponse } from 'next/server';
import {
  getProposalById,
  getProposalByToken,
  addProposalUpdate,
  updateProposalUpdateStatus,
} from '@/lib/proposals/store';
import type { ProposalUpdateInput } from '@/lib/proposals/types';
import { Resend } from 'resend';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const proposal = (await getProposalById(id)) || (await getProposalByToken(id));
    if (!proposal) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, updates: proposal.updates || [] });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await req.json()) as ProposalUpdateInput;

    if (!body.message || !body.message.trim()) {
      return NextResponse.json({ error: 'Update message cannot be empty' }, { status: 400 });
    }

    if (!body.category) {
      return NextResponse.json({ error: 'Category is required' }, { status: 400 });
    }

    const result = await addProposalUpdate(id, body);
    if (!result) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }

    const { proposal, update } = result;

    // Send instant email notification to Saddlewood Estimating / Field Leadership
    if (process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const categoryLabels: Record<string, string> = {
          drawing_revision: '📐 Plan Revision / Drawing Markup',
          scope_change: '📝 Scope Change / Addition Request',
          site_photo: '📸 Jobsite Condition Photo',
          clarification: '💬 Scope Clarification Request',
          schedule_update: '⏱️ Schedule / Phasing Note',
        };

        const catLabel = categoryLabels[update.category] || update.category;
        const attachmentSummary = update.attachments.length > 0
          ? `<p style="margin-top: 12px; font-weight: bold; color: #1e293b;">📎 Attached Files (${update.attachments.length}):</p>
             <ul style="margin: 4px 0 0 16px; padding: 0; color: #475569;">
               ${update.attachments.map((a) => `<li>${a.name} (${Math.round(a.size / 1024)} KB)</li>`).join('')}
             </ul>`
          : '<p style="color: #64748b; font-size: 13px;">No files attached.</p>';

        await resend.emails.send({
          from: 'Saddlewood Proposals <info@saddlewoodcontracting.com>',
          to: ['info@saddlewoodcontracting.com', 'marco@saddlewoodcontracting.com'],
          replyTo: update.author_email || 'info@saddlewoodcontracting.com',
          subject: `🔔 [Proposal Update] ${proposal.project_name}: ${catLabel}`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
              <div style="border-bottom: 2px solid #0f766e; padding-bottom: 12px; margin-bottom: 16px;">
                <h2 style="color: #0f766e; margin: 0; font-size: 20px;">Saddlewood Proposal Intake Alert</h2>
                <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">New context or revision submitted for <strong>${proposal.project_name}</strong></p>
              </div>

              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 16px;">
                <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>From:</strong> ${update.author_name} ${update.author_email ? `&lt;${update.author_email}&gt;` : ''}</p>
                <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Category:</strong> ${catLabel}</p>
                <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Current Drawing Basis:</strong> ${proposal.drawing_basis.current_rev}</p>
                <p style="margin: 0; font-size: 14px;"><strong>Submitted:</strong> ${new Date(update.created_at).toLocaleString()}</p>
              </div>

              <div style="padding: 14px; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; margin-bottom: 16px;">
                <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: bold; color: #92400e;">Client / Field Note:</p>
                <p style="margin: 0; font-size: 14px; color: #78350f; white-space: pre-wrap; line-height: 1.5;">${update.message}</p>
              </div>

              ${attachmentSummary}

              <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; display: flex; gap: 12px;">
                <a href="https://saddlewoodcontracting.com/p/${proposal.token}" style="background: #0f766e; color: #ffffff; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 600; display: inline-block;">
                  View Live Proposal
                </a>
                <a href="https://saddlewoodcontracting.com/internal/proposals" style="background: #f1f5f9; color: #334155; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 600; display: inline-block; margin-left: 8px;">
                  Open Estimator Hub
                </a>
              </div>
            </div>
          `,
        });
      } catch (mailErr) {
        console.error('Failed to dispatch proposal update notification email:', mailErr);
      }
    }

    return NextResponse.json({ ok: true, update, proposal }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    if (!body.update_id || !body.status) {
      return NextResponse.json({ error: 'update_id and status are required' }, { status: 400 });
    }

    const updated = await updateProposalUpdateStatus(id, body.update_id, body.status);
    if (!updated) {
      return NextResponse.json({ error: 'Proposal or update item not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, proposal: updated });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

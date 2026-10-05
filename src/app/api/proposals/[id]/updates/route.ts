import { NextRequest, NextResponse } from 'next/server';
import { authorizeOps } from '@/lib/ops/auth';
import { escapeHtml } from '@/lib/emailTemplate';
import { openProposal } from '@/lib/proposals/access';
import { addProposalUpdate, updateProposalUpdateStatus } from '@/lib/proposals/store';
import type { ProposalUpdateCategory, ProposalUpdateInput } from '@/lib/proposals/types';
import { Resend } from 'resend';

export const dynamic = 'force-dynamic';

const CATEGORY_LABELS: Record<ProposalUpdateCategory, string> = {
  drawing_revision: '📐 Plan Revision / Drawing Markup',
  scope_change: '📝 Scope Change / Addition Request',
  site_photo: '📸 Jobsite Condition Photo',
  clarification: '💬 Scope Clarification Request',
  schedule_update: '⏱️ Schedule / Phasing Note',
};

const EMAIL_SHAPE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const access = await openProposal(request, id);
    if (!access) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, updates: access.proposal.updates || [] });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as ProposalUpdateInput;

    if (!body.message || !body.message.trim()) {
      return NextResponse.json({ error: 'Update message cannot be empty' }, { status: 400 });
    }

    if (!body.category || !Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, body.category)) {
      return NextResponse.json({ error: 'Category is required' }, { status: 400 });
    }

    const access = await openProposal(request, id);
    if (!access) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }

    const result = await addProposalUpdate(access.proposal.id, body);
    if (!result) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }

    const { proposal, update } = result;

    // Send instant email notification to Saddlewood Estimating / Field Leadership.
    // Everything the sender typed is escaped: it lands in the owners' inboxes.
    if (process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const catLabel = CATEGORY_LABELS[update.category];
        const authorEmail =
          update.author_email && EMAIL_SHAPE.test(update.author_email) ? update.author_email : '';
        const attachmentSummary = update.attachments.length > 0
          ? `<p style="margin-top: 12px; font-weight: bold; color: #1e293b;">📎 Attached Files (${update.attachments.length}):</p>
             <ul style="margin: 4px 0 0 16px; padding: 0; color: #475569;">
               ${update.attachments.map((a) => `<li>${escapeHtml(String(a.name))} (${Math.round(Number(a.size) / 1024) || 0} KB)</li>`).join('')}
             </ul>`
          : '<p style="color: #64748b; font-size: 13px;">No files attached.</p>';

        await resend.emails.send({
          from: 'Saddlewood Proposals <info@saddlewoodcontracting.com>',
          to: ['info@saddlewoodcontracting.com', 'marco@saddlewoodcontracting.com'],
          replyTo: authorEmail || 'info@saddlewoodcontracting.com',
          subject: `🔔 [Proposal Update] ${proposal.project_name}: ${catLabel}`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
              <div style="border-bottom: 2px solid #0f766e; padding-bottom: 12px; margin-bottom: 16px;">
                <h2 style="color: #0f766e; margin: 0; font-size: 20px;">Saddlewood Proposal Intake Alert</h2>
                <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">New context or revision submitted for <strong>${escapeHtml(proposal.project_name)}</strong></p>
              </div>

              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 16px;">
                <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>From:</strong> ${escapeHtml(String(update.author_name))} ${authorEmail ? `&lt;${escapeHtml(authorEmail)}&gt;` : ''}</p>
                <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Category:</strong> ${catLabel}</p>
                <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Current Drawing Basis:</strong> ${escapeHtml(proposal.drawing_basis.current_rev)}</p>
                <p style="margin: 0; font-size: 14px;"><strong>Submitted:</strong> ${new Date(update.created_at).toLocaleString()}</p>
              </div>

              <div style="padding: 14px; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; margin-bottom: 16px;">
                <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: bold; color: #92400e;">Client / Field Note:</p>
                <p style="margin: 0; font-size: 14px; color: #78350f; white-space: pre-wrap; line-height: 1.5;">${escapeHtml(String(update.message))}</p>
              </div>

              ${attachmentSummary}

              <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; display: flex; gap: 12px;">
                <a href="https://saddlewoodcontracting.com/p/${encodeURIComponent(proposal.token)}" style="background: #0f766e; color: #ffffff; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 600; display: inline-block;">
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

// Marking a note acknowledged or incorporated is staff work.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await authorizeOps(request))) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();

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

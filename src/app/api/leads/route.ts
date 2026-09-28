import { NextResponse } from 'next/server';
import { getLeadsState, updateLeadStatus, recordInboundLead } from '@/lib/leads/store';
import { Resend } from 'resend';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === 'true';

    const state = await getLeadsState(forceRefresh);
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    console.error('Error fetching leads state:', error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Support GHL format, Voice AI format (Vapi/Retell), or custom webhook payload
    const phone =
      body.phone ||
      body.contact?.phone ||
      body.customer?.number ||
      body.call?.customer?.number ||
      body.from;

    if (!phone) {
      return NextResponse.json(
        { ok: false, error: 'Phone number is required in webhook payload' },
        { status: 400 }
      );
    }

    const name =
      body.name ||
      (body.first_name ? `${body.first_name} ${body.last_name || ''}`.trim() : null) ||
      body.contact?.name ||
      body.customer?.name ||
      body.call?.customer?.name;

    const email = body.email || body.contact?.email;
    const summary =
      body.summary ||
      body.call?.summary ||
      body.analysis?.structuredData?.summary ||
      body.transcript ||
      body.message ||
      body.notes;

    const tags = Array.isArray(body.tags)
      ? body.tags
      : body.tag
      ? [body.tag]
      : ['ghl-webhook', 'voice-ai-lead'];

    const lead = await recordInboundLead({
      phone: String(phone),
      name: name ? String(name) : undefined,
      email: email ? String(email) : undefined,
      snippet: summary ? String(summary).slice(0, 160) : 'Inbound inquiry via webhook',
      summary: summary ? String(summary) : undefined,
      tags,
    });

    // Send instant email notification via Resend
    if (process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: 'Saddlewood Leads <info@saddlewoodcontracting.com>',
          to: ['info@saddlewoodcontracting.com', 'marco@saddlewoodcontracting.com'],
          subject: `🚨 [New Inbound Lead] ${lead.name || lead.display} (${lead.tags.join(', ')})`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
              <div style="border-bottom: 2px solid #0f766e; padding-bottom: 12px; margin-bottom: 16px;">
                <h2 style="color: #0f766e; margin: 0; font-size: 20px;">🚨 New Inbound Lead Alert</h2>
                <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">Received via GoHighLevel / Voice AI Webhook</p>
              </div>

              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 16px;">
                <p style="margin: 0 0 8px 0; font-size: 15px;"><strong>Caller / Contact:</strong> ${lead.name || 'Anonymous Caller'}</p>
                <p style="margin: 0 0 8px 0; font-size: 15px;"><strong>Phone:</strong> <a href="${lead.dial_url}" style="color: #0f766e; font-weight: bold;">${lead.display}</a></p>
                ${lead.email ? `<p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Email:</strong> ${lead.email}</p>` : ''}
                <p style="margin: 0; font-size: 13px; color: #64748b;"><strong>Tags:</strong> ${lead.tags.join(', ')}</p>
              </div>

              ${summary ? `
              <div style="padding: 14px; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; margin-bottom: 16px;">
                <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; font-weight: bold; color: #92400e;">Call Summary / Transcript:</p>
                <p style="margin: 0; font-size: 14px; color: #78350f; white-space: pre-wrap; line-height: 1.5;">${summary}</p>
              </div>` : ''}

              <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; display: flex; gap: 12px;">
                <a href="${lead.dial_url}" style="background: #0f766e; color: #ffffff; padding: 12px 20px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 600; display: inline-block;">
                  📞 1-Tap Call Back
                </a>
                <a href="${lead.sms_url}" style="background: #1e293b; color: #ffffff; padding: 12px 20px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 600; display: inline-block; margin-left: 8px;">
                  💬 1-Tap Text Reply
                </a>
                <a href="https://saddlewoodcontracting.com/internal/leads" style="background: #f1f5f9; color: #334155; padding: 12px 20px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 600; display: inline-block; margin-left: 8px;">
                  Open Leads Portal
                </a>
              </div>
            </div>
          `,
        });
      } catch (mailErr) {
        console.error('Failed to send lead email alert:', mailErr);
      }
    }

    return NextResponse.json({ ok: true, lead }, { status: 201 });
  } catch (error) {
    console.error('Error handling lead webhook:', error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { phone, status } = body;

    if (!phone || !['pending', 'called', 'texted', 'dismissed'].includes(status)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid phone or status' },
        { status: 400 }
      );
    }

    await updateLeadStatus(phone, status);
    return NextResponse.json({ ok: true, phone, status });
  } catch (error) {
    console.error('Error updating lead status:', error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}


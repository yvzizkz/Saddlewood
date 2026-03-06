import { NextResponse } from "next/server";

/**
 * GoHighLevel Integration — Contact Form API Route
 *
 * This route handles form submissions and forwards them to GoHighLevel.
 *
 * SETUP INSTRUCTIONS:
 * 1. In GoHighLevel, go to Automation > Workflows
 * 2. Create a new workflow with trigger: "Inbound Webhook"
 * 3. Copy the webhook URL and add it to your .env.local:
 *    GHL_WEBHOOK_URL=https://services.leadconnectorhq.com/hooks/...
 *
 * 4. (Optional) For direct API integration, also add:
 *    GHL_API_KEY=your-api-key
 *    GHL_LOCATION_ID=your-location-id
 *
 * The webhook approach is recommended as it's simpler and more flexible.
 * The workflow in GHL can then:
 *   - Create/update the contact
 *   - Create an opportunity in your pipeline
 *   - Send an auto-reply email
 *   - Notify your team via SMS/email
 *   - Add tags based on project type
 */

const GHL_WEBHOOK_URL = process.env.GHL_WEBHOOK_URL || "";
const GHL_API_KEY = process.env.GHL_API_KEY || "";
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || "";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      firstName,
      lastName,
      name,
      email,
      phone,
      neighborhood,
      projectType,
      message,
      source,
      tags,
    } = body;

    // Validate required fields
    if (!name || !email) {
      return NextResponse.json(
        { error: "Name and email are required" },
        { status: 400 }
      );
    }

    // METHOD 1: Webhook (recommended — simpler, more flexible)
    if (GHL_WEBHOOK_URL) {
      const webhookResponse = await fetch(GHL_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          name,
          email,
          phone,
          neighborhood,
          projectType,
          message,
          source,
          tags,
          submittedAt: new Date().toISOString(),
        }),
      });

      if (!webhookResponse.ok) {
        console.error("GHL webhook failed:", webhookResponse.status);
        return NextResponse.json(
          { error: "Failed to process submission" },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, method: "webhook" });
    }

    // METHOD 2: Direct API (if webhook URL not set)
    if (GHL_API_KEY && GHL_LOCATION_ID) {
      // Create contact in GoHighLevel
      const contactResponse = await fetch(
        "https://services.leadconnectorhq.com/contacts/",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${GHL_API_KEY}`,
            "Content-Type": "application/json",
            Version: "2021-07-28",
          },
          body: JSON.stringify({
            firstName,
            lastName,
            email,
            phone,
            locationId: GHL_LOCATION_ID,
            source: source || "Website Contact Form",
            tags: tags || ["website-lead"],
            customFields: [
              { key: "neighborhood", field_value: neighborhood },
              { key: "project_type", field_value: projectType },
              { key: "project_description", field_value: message },
            ],
          }),
        }
      );

      if (!contactResponse.ok) {
        const errorBody = await contactResponse.text();
        console.error("GHL API error:", contactResponse.status, errorBody);
        return NextResponse.json(
          { error: "Failed to create contact" },
          { status: 500 }
        );
      }

      const contactData = await contactResponse.json();
      return NextResponse.json({
        success: true,
        method: "api",
        contactId: contactData.contact?.id,
      });
    }

    // No GHL credentials configured — log submission for now
    console.log("📝 Contact form submission (GHL not configured):", {
      name,
      email,
      phone,
      neighborhood,
      projectType,
      message,
      submittedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      method: "logged",
      message: "Submission received. Configure GHL_WEBHOOK_URL in .env.local to enable GoHighLevel integration.",
    });
  } catch (error) {
    console.error("Contact form error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

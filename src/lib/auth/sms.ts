import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const GHL_API_KEY = process.env.GHL_API_KEY || "";
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || "";

export async function sendOtpMessage(phone: string, code: string, link: string): Promise<{ sent: boolean; channel?: string }> {
  const text = `Saddlewood Security Code: ${code}\n\nSign in directly:\n${link}\n\nValid for 10 minutes.`;

  // 1. Try native macOS iMessage if running in darwin environment
  if (process.platform === "darwin") {
    try {
      const script = `
on run {target, body}
    tell application "Messages"
        set targetService to 1st service whose service type = iMessage
        set targetBuddy to buddy target of targetService
        send body to targetBuddy
    end tell
end run`;
      await execFileAsync("osascript", ["-e", script, phone, text], { timeout: 8000 });
      return { sent: true, channel: "iMessage" };
    } catch (e) {
      console.warn("[sms] local iMessage send failed, trying fallbacks:", (e as Error).message);
    }
  }

  // 2. Try GoHighLevel SMS API if configured
  if (GHL_API_KEY && GHL_LOCATION_ID) {
    try {
      // Find or create contact, then send SMS message
      const res = await fetch("https://services.leadconnectorhq.com/conversations/messages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GHL_API_KEY}`,
          Version: "2021-04-15",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "SMS",
          contactId: undefined,
          phone,
          message: text,
        }),
      });
      if (res.ok) {
        return { sent: true, channel: "GHL-SMS" };
      }
    } catch (e) {
      console.warn("[sms] GHL SMS failed:", (e as Error).message);
    }
  }

  return { sent: false };
}

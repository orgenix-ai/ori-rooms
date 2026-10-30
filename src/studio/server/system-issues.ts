/**
 * Inside Ori, an issue for Orgenix's operators (never shown to a founder). Outside Ori there are no operators, so the
 * room code's operator notes go to the console.
 */
export async function openPlatformSystemIssue(issue: { category: string; code: string; title: string; message?: string; [key: string]: unknown }): Promise<void> {
  console.warn(`[operator note] ${issue.code}: ${issue.title}${issue.message ? ` — ${issue.message}` : ""}`);
}

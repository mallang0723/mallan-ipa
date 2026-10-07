/** Set by the native host before any Engine modules are loaded. */
export const isIOS = process.env.MARINARA_IOS === "1";
export function isIOSUnavailableProvider(provider: string): boolean {
  return isIOS && ["openai_chatgpt", "claude_subscription", "grok_subscription"].includes(provider);
}
let foreground = true;
export function isIOSBackgrounded(): boolean {
  return isIOS && !foreground;
}
export function setIOSForeground(active: boolean): void {
  foreground = active;
}

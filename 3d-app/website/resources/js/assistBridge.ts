/**
 * Lets 3DEEZI ASSIST (the help chat) run simple commands on a page that registers for them,
 * such as turning the 3D kit or opening a Studio panel. A handler returns what it did, or
 * throws an Error saying why it could not.
 */
export type AssistHandler = (action: string, value: string) => string | Promise<string>;

const handlers = new Map<string, AssistHandler>();

/** Registers the page's handler; returns the function that removes it. */
export function onAssist(page: string, handler: AssistHandler) {
  handlers.set(page, handler);
  return () => { if (handlers.get(page) === handler) handlers.delete(page); };
}

export const assistHandler = (page: string) => handlers.get(page);

/**
 * What the page on screen tells 3DEEZI ASSIST with every question (e.g. the order form's team, garments and
 * sizes), so the answer fits it. One page at a time; returns the function that removes it.
 */
let pageContext: (() => string) | null = null;
export function provideAssistContext(describe: () => string) {
  pageContext = describe;
  return () => { if (pageContext === describe) pageContext = null; };
}
export function assistContext(): string | undefined {
  try { return pageContext?.() || undefined; } catch { return undefined; }
}

/** Opens the 3DEEZI ASSIST chat and asks it this question, as if typed there (from a page's own "Ask for help" box). */
export function askAssist(question: string) {
  window.dispatchEvent(new CustomEvent<string>('assist-ask', { detail: question }));
}

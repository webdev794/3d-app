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

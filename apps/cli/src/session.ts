/**
 * Session state for a ZHcode CLI run.
 *
 * Holds conversation history so later phases can feed it to the agent
 * runtime without touching CLI code.
 */

export interface SessionMessage {
  role: "user" | "assistant";
  content: string;
}

export class Session {
  private readonly messages: SessionMessage[] = [];
  readonly startedAt: Date;

  constructor() {
    this.startedAt = new Date();
  }

  addUserMessage(content: string): void {
    this.messages.push({ role: "user", content });
  }

  addAssistantMessage(content: string): void {
    this.messages.push({ role: "assistant", content });
  }

  get history(): ReadonlyArray<SessionMessage> {
    return Object.freeze([...this.messages]);
  }

  get messageCount(): number {
    return this.messages.length;
  }

  /** Drop all conversation state (the /clear command). */
  reset(): void {
    this.messages.length = 0;
  }
}

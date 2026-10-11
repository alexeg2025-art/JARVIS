export type ChatMessage = { id: string; role: 'user'|'assistant'; content: string; time: number };
export type ConversationSession = { id: string; title: string; createdAt: number; updatedAt: number; messages: ChatMessage[] };
export type ConversationStore = { sessions: ConversationSession[]; activeId: string };

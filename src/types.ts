export type BotStatus = 'stopped' | 'running' | 'error';
export type PlanType = 'free' | 'pro' | 'vip';
export type LogLevel = 'info' | 'warn' | 'error';

export interface Profile {
  id: string;
  email: string;
  createdAt: string;
}

export interface UserRole {
  userId: string;
  role: 'admin' | 'user';
}

export interface Bot {
  id: string;
  userId: string;
  name: string;
  language: string;
  status: BotStatus;
  entryPoint?: string;
  uptimeStart?: string;
  createdAt: string;
}

export interface BotLog {
  id: string;
  botId: string;
  message: string;
  level: LogLevel;
  createdAt: string;
}

export interface Subscription {
  userId: string;
  plan: PlanType;
  expiresAt?: string;
}

export interface ChatFileItem {
  filename: string;
  content: string;
}

export interface ChatSecretItem {
  key: string;
  description: string;
  placeholder?: string;
}

export interface ChatMessageItem {
  role: 'user' | 'model';
  content: string;
  isCustomMarkdown?: boolean;
  files?: ChatFileItem[];
  secrets?: ChatSecretItem[];
}

export interface ChatHistory {
  id: string;
  userId: string;
  persona: 'Agent' | 'Code Expert';
  text: string;
  messages?: ChatMessageItem[];
  timestamp: any;
  pinned?: boolean;
}

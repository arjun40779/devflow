import type { PullRequestState, CheckRunStatus, CheckRunConclusion } from './enums';

export interface Repository {
  externalId: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  url: string;
}

export interface Branch {
  name: string;
  repo: string;
  sha: string;
  url: string;
}

export interface PullRequest {
  externalId: string;
  repo: string;
  number: number;
  title: string;
  state: PullRequestState;
  url: string;
  headRef: string;
  baseRef: string;
  authorExternalId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  externalId: string;
  body: string;
  authorExternalId: string;
  url: string;
  createdAt: string;
}

export interface CheckRun {
  externalId: string;
  name: string;
  status: CheckRunStatus;
  conclusion: CheckRunConclusion;
  url: string;
}

export interface Issue {
  externalId: string;
  title: string;
  description: string | null;
  status: string;
  assigneeExternalId: string | null;
  url: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatChannel {
  externalId: string;
  name: string;
}

export interface ChatMessage {
  externalId: string;
  channelExternalId: string;
  text: string;
  authorExternalId: string;
  postedAt: string;
}

export interface CalendarEvent {
  externalId: string;
  title: string;
  start: string;
  end: string;
  url: string | null;
}

export interface FreeBusySlot {
  start: string;
  end: string;
}

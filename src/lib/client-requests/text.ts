// Every word a client (and staff, about client requests) reads about
// approving, requesting changes and asking questions, in one place. What an
// approval means legally is Move's call: keep this wording plain ("tells Move
// to proceed"), never "contract", "agreement" or "binding", until Move decides
// otherwise (client-dashboard decisions, 2026-10-12, item 4).

export const MESSAGE_MAX = { question: 1000, request_changes: 500, approve: 500, reply: 2000 } as const;

export const ACTION_LABELS = {
  approve: "Approve recommendation",
  requestChanges: "Request changes",
  ask: "Ask a question",
  newQuestion: "New question",
} as const;

export function approveTitle(name: string): string {
  return `Approve ${name}?`;
}

export function approveBody(name: string): string {
  return `This tells Move to proceed with ${name}. Your name and the time will be recorded.`;
}

export const APPROVE_NOTE_LABEL = "Add a note (optional)";
export const APPROVE_NOTE_HINT = "For example a caveat or a date that matters to you.";
export const APPROVE_CONFIRM = "Yes, approve";

export const CHANGES_TITLE = "Request changes";
export const CHANGES_BODY = "Tell Move what should change. Your name and the time will be recorded.";
export const CHANGES_REASON_LABEL = "What should change?";
export const CHANGES_CONFIRM = "Send request";

export const QUESTION_TITLE = "Ask Move a question";
export const QUESTION_BODY = "Move replies on this page, under Your questions.";
export const QUESTION_PROJECT_LABEL = "About";
export const QUESTION_LABEL = "Your question";
export const QUESTION_CALL_LABEL = "Please call me about this";
export const QUESTION_CONFIRM = "Send question";

export const CANCEL = "Cancel";

export const STATUS_LABELS: Record<string, string> = {
  sent: "Sent",
  seen: "Seen by Move",
  answered: "Answered",
};

export const KIND_LABELS: Record<string, string> = {
  approve: "Approved",
  request_changes: "Changes requested",
  question: "Question",
};

export const WITHDRAWN_REPLY = "Move withdrew this reply; a new one is coming.";

// What "Your questions" says about itself (also in the status legend).
export const CLIENT_EXPLANATION =
  "Approve a recommendation, request changes or ask a question here. Move sees it straight away and replies on this page. Everyone at your company with a portal login sees these, with who sent each one.";

export const SENT_OK = {
  approve: "Approved. Move has been told to proceed.",
  request_changes: "Sent. Move will be in touch about the changes.",
  question: "Sent. Move's reply will appear under Your questions.",
} as const;

// Database error codes (submit_client_request) to friendly text. Never more
// specific than this: a client learns nothing about other clients' data.
export const REQUEST_ERRORS: Record<string, string> = {
  CQ403: "This can't be sent from your account right now. Please contact your Move contact.",
  CQ409: "This has changed since you opened the page: there may be a newer update, or someone at your company has already responded. Reload the page to see the latest.",
  CQ422: "Please check your message: it can't be empty or too long.",
  CQ429: "You've sent a lot of requests in a short time. Please wait a little and try again, or contact your Move contact.",
};
export const REQUEST_ERROR_FALLBACK = "That didn't go through. Please try again in a moment.";

// ---- Staff ----------------------------------------------------------------------------
export function replyWarning(clientName: string): string {
  return `Your reply is shown to ${clientName} in their portal straight away. It can't be edited after you save it (an admin can withdraw it).`;
}
export const WITHDRAW_CONFIRM =
  "The client will see “Move withdrew this reply; a new one is coming” instead of the text, and the project owner can reply again. The withdrawn text stays visible to staff.";
export const STAFF_REPLY_ERRORS: Record<string, string> = {
  "42501": "Only the project's owner or an admin can do this.",
  CQ409: "This request has changed since you opened it. Reload the page.",
  CQ422: "Write a reply (up to 2,000 characters).",
};

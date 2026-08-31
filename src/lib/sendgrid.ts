const SENDGRID_API_BASE = "https://api.sendgrid.com/v3";

export type SendGridList = {
  id: string;
  name: string;
  contact_count: number;
};

export type SendGridSegment = {
  id: string;
  name: string;
  contacts_count?: number;
};

export type SingleSendStatus = "draft" | "scheduled" | "in_progress" | "triggered" | "canceled";

export type SingleSend = {
  id: string;
  name: string;
  status: SingleSendStatus;
  send_at?: string | null;
};

class SendGridError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`SendGrid API error (${status}): ${JSON.stringify(body)}`);
  }
}

async function sgFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    throw new Error("SENDGRID_API_KEY is not set");
  }

  const res = await fetch(`${SENDGRID_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    throw new SendGridError(res.status, body);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

export async function listContactLists(): Promise<SendGridList[]> {
  const data = await sgFetch<{ result: SendGridList[] }>("/marketing/lists?page_size=200");
  return data.result;
}

export async function listSegments(): Promise<SendGridSegment[]> {
  const data = await sgFetch<{ results: SendGridSegment[] }>("/marketing/segments/2.0?page_size=200");
  return data.results ?? [];
}

export type CreateSingleSendInput = {
  name: string;
};

export async function createSingleSend(input: CreateSingleSendInput): Promise<SingleSend> {
  return sgFetch<SingleSend>("/marketing/singlesends", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type UpdateSingleSendInput = {
  name?: string;
  send_to?: {
    list_ids?: string[];
    segment_ids?: string[];
    all?: boolean;
  };
  email_config?: {
    subject: string;
    html_content: string;
    plain_content?: string;
    sender_id?: number;
    suppression_group_id?: number;
  };
};

export async function updateSingleSend(id: string, input: UpdateSingleSendInput): Promise<SingleSend> {
  return sgFetch<SingleSend>(`/marketing/singlesends/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function scheduleSingleSend(id: string, sendAt: "now" | string): Promise<SingleSend> {
  return sgFetch<SingleSend>(`/marketing/singlesends/${id}/schedule`, {
    method: "PUT",
    body: JSON.stringify({ send_at: sendAt }),
  });
}

export async function getSingleSend(id: string): Promise<SingleSend> {
  return sgFetch<SingleSend>(`/marketing/singlesends/${id}`);
}

export type Sender = {
  id: number;
  nickname: string;
  from_email: string;
  from_name: string;
  verified: boolean;
  locked: boolean;
};

export async function listVerifiedSenders(): Promise<Sender[]> {
  const data = await sgFetch<{ results: Sender[] }>("/verified_senders");
  return (data.results ?? []).filter((s) => s.verified);
}

export type SuppressionGroup = {
  id: number;
  name: string;
  description: string;
  is_default: boolean;
};

export async function listSuppressionGroups(): Promise<SuppressionGroup[]> {
  return sgFetch<SuppressionGroup[]>("/asm/groups");
}

export async function createList(name: string): Promise<SendGridList> {
  return sgFetch<SendGridList>("/marketing/lists", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export type ContactImportJob = {
  job_id: string;
};

export async function upsertContactsToList(listId: string, emails: string[]): Promise<ContactImportJob> {
  return sgFetch<ContactImportJob>("/marketing/contacts", {
    method: "PUT",
    body: JSON.stringify({
      list_ids: [listId],
      contacts: emails.map((email) => ({ email })),
    }),
  });
}

export type ContactImportStatus = {
  status: "pending" | "completed" | "errored" | "failed";
};

export async function getContactImportStatus(jobId: string): Promise<ContactImportStatus> {
  return sgFetch<ContactImportStatus>(`/marketing/contacts/imports/${jobId}`);
}

/**
 * Polls the async contact import job until it finishes or the timeout elapses.
 * SendGrid's contact upsert is not synchronous, so the target list isn't
 * guaranteed to have members until this resolves "completed".
 */
export async function waitForContactImport(
  jobId: string,
  { timeoutMs = 20_000, intervalMs = 2_000 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<ContactImportStatus> {
  const deadline = Date.now() + timeoutMs;
  let last: ContactImportStatus = { status: "pending" };
  while (Date.now() < deadline) {
    last = await getContactImportStatus(jobId);
    if (last.status !== "pending") {
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return last;
}

export type DomainAuthentication = {
  id: number;
  domain: string;
  valid: boolean;
  dns: Record<string, { valid: boolean; type: string; host: string; data: string }>;
};

export async function listAuthenticatedDomains(): Promise<DomainAuthentication[]> {
  return sgFetch<DomainAuthentication[]>("/whitelabel/domains");
}

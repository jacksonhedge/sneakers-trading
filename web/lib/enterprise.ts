export interface EnterpriseLead {
  name: string;
  email: string;
  company: string;
  role?: string;
  chairs: number;
  useCase: string;
  phone?: string;
  submittedAt: number;
}

const STORAGE_KEY = "otoole:enterprise-leads:v1";

export function saveLeadLocally(lead: EnterpriseLead) {
  if (typeof window === "undefined") return;
  const existing = loadLeadsLocally();
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...existing, lead]));
}

export function loadLeadsLocally(): EnterpriseLead[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function submitLead(lead: EnterpriseLead): Promise<{ ok: boolean; id?: string; error?: string }> {
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";
  try {
    const res = await fetch(`${API_BASE}/v1/enterprise/lead`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lead),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error ?? `HTTP ${res.status}` };
    return { ok: true, id: data.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

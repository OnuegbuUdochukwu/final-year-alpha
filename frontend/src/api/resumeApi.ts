// frontend/src/api/resumeApi.ts
// Typed API client for all resume-related endpoints.

const GATEWAY = import.meta.env.VITE_GATEWAY_URL ?? "http://localhost:8080";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CourseItem {
  name: string;
  provider?: string;
}

export interface ExperienceItem {
  title: string;
  company: string;
  location: string;
  dates: string;
  duties: string[];
}

export interface AdditionalSection {
  title: string;
  items: string[];
}

/**
 * The biographical data returned by GET /api/user/biography.
 * These sections are extracted deterministically (no LLM) from the uploaded CV.
 */
export interface BiographyData {
  user_id: string;
  summary: string;
  education: string;
  experience: string;
}

// ─── API Functions ────────────────────────────────────────────────────────────

/**
 * Fetches the deterministically extracted biographical data for the current user.
 * Called by ResumeBuilder on mount to pre-populate Summary and Education fields.
 * @param token  JWT access token
 */
export async function getUserBiography(token: string): Promise<BiographyData> {
  const resp = await fetch(`${GATEWAY}/api/user/biography`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new Error(err.detail ?? "Failed to fetch biography data");
  }

  return resp.json();
}

export interface ResumePayload {
  name?: string;
  title?: string;
  email?: string;
  linkedin?: string;
  phone?: string;
  location?: string;
  /** User-edited professional summary text (from canvas) */
  summary?: string;
  /** User-edited education block text (from canvas) */
  education?: string;
  experience?: ExperienceItem[];
  cv_skills?: string[];
  gained_skills?: string[];
  user_additions?: string[];
  user_removals?: string[];
  order?: string[];
  target_role?: string;
  courses?: CourseItem[];
  additional_sections?: AdditionalSection[];
}

export interface ResumeSkillsResponse {
  user_id: string;
  cv_skills: string[];
  gained_skills: string[];
  merged: string[];
}

// ─── API Functions ────────────────────────────────────────────────────────────

/**
 * Fetches the merged skill list for the current user.
 * @param token   JWT access token
 * @param cvSkills  CV skills from SkillRadar state (passed as query param)
 */
export async function getResumeSkills(
  token: string,
  cvSkills: string[] = []
): Promise<ResumeSkillsResponse> {
  const params = cvSkills.length
    ? `?cv_skills=${encodeURIComponent(cvSkills.join(","))}`
    : "";

  const resp = await fetch(`${GATEWAY}/api/v1/resume/skills${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new Error(err.detail ?? "Failed to fetch resume skills");
  }

  return resp.json();
}

/**
 * Requests an HTML preview string from the server (no PDF cost).
 * @returns Raw HTML string to inject into an iframe srcdoc
 */
export async function previewResume(
  token: string,
  payload: ResumePayload
): Promise<string> {
  const resp = await fetch(`${GATEWAY}/api/v1/resume/preview`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new Error(err.detail ?? "Failed to render resume preview");
  }

  return resp.text(); // HTML string
}

/**
 * Generates and downloads a PDF resume.
 * Triggers a browser download via a Blob URL.
 * @param name  Used to derive the downloaded filename
 */
export async function downloadResume(
  token: string,
  payload: ResumePayload
): Promise<void> {
  const resp = await fetch(`${GATEWAY}/api/v1/resume/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (resp.status === 429) {
    throw new Error("Rate limit reached. Please wait a moment before trying again.");
  }
  if (resp.status === 504) {
    throw new Error("PDF generation timed out. Please try again.");
  }
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new Error(err.detail ?? "PDF generation failed");
  }

  // Trigger browser download via Blob URL
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeName = (payload.name ?? "resume").replace(/\s+/g, "_");
  a.href = url;
  a.download = `resume_${safeName}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

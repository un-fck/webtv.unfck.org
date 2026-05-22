import { cookies } from "next/headers";
import { randomBytes, createHmac, timingSafeEqual } from "crypto";
import { pool, q } from "@/lib/db";

async function query<T = unknown>(
  sql: string,
  args: unknown[] = [],
): Promise<T[]> {
  const { text, values } = q(sql, args);
  const result = await pool.query(text, values);
  return result.rows as T[];
}

const getSecret = () => {
  const secret = process.env.AUTH_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be set in production");
  }
  return secret || "dev-secret-change-me";
};

const COOKIE_NAME = "auth_session";

export async function isAllowedDomain(email: string): Promise<boolean> {
  const domain = email.toLowerCase().split("@")[1];
  if (!domain) return false;
  const rows = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM webtv.allowed_domains WHERE domain = ?`,
    [domain],
  );
  return parseInt(rows[0]?.count || "0") > 0;
}

export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export async function recentTokenExists(email: string): Promise<boolean> {
  // Block if an unused token was sent in the last 2 minutes (tokens expire 15
  // minutes after creation).
  const rows = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM webtv.magic_tokens
     WHERE email = ? AND used_at IS NULL AND expires_at > NOW() + INTERVAL '13 minutes'`,
    [email.toLowerCase()],
  );
  return parseInt(rows[0]?.count || "0") > 0;
}

export async function createMagicToken(email: string): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await query(
    `INSERT INTO webtv.magic_tokens (token, email, expires_at) VALUES (?, ?, ?)`,
    [token, email.toLowerCase(), expiresAt],
  );
  return token;
}

export async function verifyMagicToken(token: string): Promise<string | null> {
  const rows = await query<{ email: string }>(
    `UPDATE webtv.magic_tokens SET used_at = NOW() WHERE token = ? AND expires_at > NOW() AND used_at IS NULL RETURNING email`,
    [token],
  );
  return rows[0]?.email || null;
}

export async function upsertUser(email: string): Promise<string> {
  const rows = await query<{ id: string }>(
    `INSERT INTO webtv.users (email, last_login_at) VALUES (?, NOW())
     ON CONFLICT (email) DO UPDATE SET last_login_at = NOW() RETURNING id`,
    [email.toLowerCase()],
  );
  return rows[0].id;
}

function signSession(userId: string): string {
  const payload = JSON.stringify({
    userId,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
  });
  const sig = createHmac("sha256", getSecret()).update(payload).digest("hex");
  return Buffer.from(payload).toString("base64") + "." + sig;
}

export function verifySession(token: string): { userId: string } | null {
  try {
    const [payloadB64, sig] = token.split(".");
    if (!payloadB64 || !sig) return null;
    const payload = Buffer.from(payloadB64, "base64").toString();
    const expectedSig = createHmac("sha256", getSecret())
      .update(payload)
      .digest("hex");
    const sigBuf = Buffer.from(sig, "hex");
    const expectedBuf = Buffer.from(expectedSig, "hex");
    if (
      sigBuf.length !== expectedBuf.length ||
      !timingSafeEqual(sigBuf, expectedBuf)
    )
      return null;
    const data = JSON.parse(payload);
    if (data.exp < Date.now()) return null;
    return { userId: data.userId };
  } catch {
    return null;
  }
}

export async function createSession(userId: string) {
  const token = signSession(userId);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });
}

export async function getSession(): Promise<{ userId: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export interface AuthUser {
  id: string;
  email: string;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = await getSession();
  if (!session) return null;
  const rows = await query<{ id: string; email: string }>(
    `SELECT id, email FROM webtv.users WHERE id = ?`,
    [session.userId],
  );
  if (!rows[0]) return null;
  return { id: rows[0].id, email: rows[0].email };
}

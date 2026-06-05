import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const AUTH_DIR = path.join(homedir(), ".haema");
const AUTH_FILE = path.join(AUTH_DIR, "auth.json");

export type Auth = {
  appUrl: string;
  apiKey: string;
  email?: string;
  signedInAt: string;
};

export function authFilePath(): string {
  return AUTH_FILE;
}

export async function readAuth(): Promise<Auth | null> {
  try {
    const raw = await fs.readFile(AUTH_FILE, "utf8");
    const data = JSON.parse(raw) as Partial<Auth>;
    if (typeof data.appUrl !== "string" || typeof data.apiKey !== "string") return null;
    return {
      appUrl: data.appUrl,
      apiKey: data.apiKey,
      email: typeof data.email === "string" ? data.email : undefined,
      signedInAt: typeof data.signedInAt === "string" ? data.signedInAt : "",
    };
  } catch {
    return null;
  }
}

export async function writeAuth(auth: Auth): Promise<void> {
  await fs.mkdir(AUTH_DIR, { recursive: true, mode: 0o700 });
  await fs.writeFile(AUTH_FILE, JSON.stringify(auth, null, 2), { mode: 0o600 });
}

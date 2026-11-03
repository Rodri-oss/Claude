import "server-only";
import type { User } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSessionUser, isAdmin } from "./auth";

export function json(data: unknown, init?: number | ResponseInit) {
  return NextResponse.json(data, typeof init === "number" ? { status: init } : init);
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Handler<C> = (req: Request, user: User, ctx: C) => Promise<Response>;

function wrap<C>(handler: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    try {
      return await handler(req, ctx);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: "Server error" }, 500);
    }
  };
}

/** Route handler for signed-in users; responds 401 otherwise. */
export function withUser<C = unknown>(handler: Handler<C>) {
  return wrap<C>(async (req, ctx) => {
    const user = await getSessionUser();
    if (!user) throw new HttpError(401, "Please sign in");
    return handler(req, user, ctx);
  });
}

/** Route handler for the admin only; responds 404 to everyone else. */
export function withAdmin<C = unknown>(handler: Handler<C>) {
  return wrap<C>(async (req, ctx) => {
    const user = await getSessionUser();
    if (!isAdmin(user)) throw new HttpError(404, "Not found");
    return handler(req, user!, ctx);
  });
}

/** Route handler open to everyone (user may be null). */
export function withOptionalUser<C = unknown>(handler: (req: Request, user: User | null, ctx: C) => Promise<Response>) {
  return wrap<C>(async (req, ctx) => handler(req, await getSessionUser(), ctx));
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}

export function int(v: unknown, min: number, max: number, name: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `Invalid ${name}`);
  return n;
}

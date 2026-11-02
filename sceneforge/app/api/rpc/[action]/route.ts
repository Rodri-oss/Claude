import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { actions } from '@/lib/api/actions';
import { ApprovalRequiredError, PrerequisiteError } from '@/lib/approvals/service';
import { BudgetError } from '@/lib/budget/service';
import { ProviderError } from '@/lib/providers/types';
import { LockedError } from '@/lib/characters/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  const handler = (actions as Record<string, { input: { parse: (v: unknown) => unknown }; run: (i: unknown) => unknown }>)[action];
  if (!handler) return NextResponse.json({ ok: false, error: `Unknown action ${action}` }, { status: 404 });
  try {
    const body = await req.json().catch(() => ({}));
    const input = handler.input.parse(body);
    const data = await handler.run(input);
    return NextResponse.json({ ok: true, data: data ?? null });
  } catch (e) {
    let code = 'error';
    let status = 400;
    let message = e instanceof Error ? e.message : String(e);
    if (e instanceof ZodError) {
      code = 'validation';
      message = e.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ');
    } else if (e instanceof ApprovalRequiredError) code = 'approval_required';
    else if (e instanceof PrerequisiteError) code = 'prerequisite';
    else if (e instanceof BudgetError) code = `budget:${e.code}`;
    else if (e instanceof ProviderError) code = `provider:${e.errorClass}`;
    else if (e instanceof LockedError) code = 'locked';
    else {
      status = 500;
      console.error(`[rpc ${action}]`, e);
    }
    return NextResponse.json({ ok: false, code, error: message }, { status });
  }
}

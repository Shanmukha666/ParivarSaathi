import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../lib/supabase-server';
import { enforceRateLimit } from '../../../lib/rate-limit';
import { fail, isUuid } from '../../../lib/guard';
import { pgMessage, readJson, str } from '../../../lib/http';
import { normaliseIndianMobile } from '../../../lib/redact';

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  if (!enforceRateLimit(`escalation:${user.id}`, 5)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '60' } });
  }

  const body = await readJson(request);
  if (!body) return fail(400, 'invalid_json');

  const reason = str(body.reason, 1000);
  if (!isUuid(body.session_id) || !reason) {
    return NextResponse.json({ error: 'Invalid escalation request' }, { status: 400 });
  }
  const consent = body.callback_phone_consent === true;
  const rawPhone = typeof body.callback_phone === 'string' ? body.callback_phone.trim() : '';
  if (body.callback_phone != null && typeof body.callback_phone !== 'string') {
    return NextResponse.json({ error: 'Invalid callback number' }, { status: 400 });
  }
  if (rawPhone && !consent) {
    return NextResponse.json({ error: 'Phone consent is required before storing a callback number' }, { status: 400 });
  }
  const phone = rawPhone ? normaliseIndianMobile(rawPhone) : null;
  if (rawPhone && !phone) {
    return NextResponse.json({ error: 'Invalid callback number' }, { status: 400 });
  }
  const slot = body.callback_slot == null || body.callback_slot === '' ? null : str(body.callback_slot, 60);
  if (body.callback_slot != null && body.callback_slot !== '' && !slot) {
    return NextResponse.json({ error: 'Invalid callback time' }, { status: 400 });
  }

  const { data: session } = await supabase
    .from('sessions')
    .select('id, owner_id, lang, district')
    .eq('id', body.session_id)
    .eq('owner_id', user.id)
    .single();
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  // The SECURITY DEFINER RPC checks ownership and atomically creates the
  // contact, preventing clients from forging status, assignee, or SLA values.
  const { data: escalationId, error } = await supabase.rpc('create_escalation', {
    p_session: session.id,
    p_reason: reason,
    p_priority: body.priority === 'high' ? 'high' : 'normal',
    p_slot: slot,
    p_phone: phone,
    p_phone_consent: consent,
  });
  if (error || !escalationId) {
    const status = pgMessage(error).includes('ticket_already_open') ? 409 : 400;
    return NextResponse.json({ error: status === 409 ? 'An open escalation already exists' : 'Could not create escalation' }, { status });
  }

  return NextResponse.json({ id: escalationId, status: 'new' }, { status: 201 });
}

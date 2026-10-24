-- claim_session compared the nonce with _key_eq, which normalizes printed keys (uppercase, strips - and _).
-- The nonce is a base64url token, so it must match exactly; it is still compared as hashes.
create or replace function public.claim_session(p_nonce text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.players;
  sid uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
begin
  if auth.uid() is null or sid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into p from public.players where user_id = auth.uid() for update;
  if not found then raise exception 'NOT_REGISTERED'; end if;
  if p.claim_nonce is null or p.claim_expires_at < now() or p_nonce is null
     or extensions.digest(p.claim_nonce, 'sha256') <> extensions.digest(p_nonce, 'sha256') then
    return public._fail('BAD_CLAIM');
  end if;
  update public.players set session_id = sid, claim_nonce = null, claim_expires_at = null where id = p.id;
  return jsonb_build_object('ok', true);
end $$;

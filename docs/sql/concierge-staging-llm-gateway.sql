-- STAGING ONLY. Requires the secret gemini_api_key to already exist in Supabase Vault.
-- The secret value is intentionally not included here.
begin;
create extension if not exists http with schema extensions;

create or replace function public.llm_generate(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '25s'
as $$
declare
  api_key text;
  body jsonb;
  resp jsonb;
begin
  select decrypted_secret into api_key
  from vault.decrypted_secrets
  where name = 'gemini_api_key'
  limit 1;
  if api_key is null then
    raise exception 'Gemini staging key is not configured in Vault';
  end if;

  body := payload || jsonb_build_object(
    'toolConfig', coalesce(payload->'toolConfig', '{"functionCallingConfig":{"mode":"AUTO"}}'::jsonb),
    'generationConfig', coalesce(payload->'generationConfig', '{"temperature":0.2}'::jsonb)
  );
  perform extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS', '5000');
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '20000');
  select content::jsonb into resp
  from extensions.http((
    'POST',
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
    array[extensions.http_header('x-goog-api-key', api_key)],
    'application/json',
    body::text
  )::extensions.http_request);
  return resp;
end;
$$;

revoke all on function public.llm_generate(jsonb) from public, anon, authenticated;
grant execute on function public.llm_generate(jsonb) to service_role;
commit;

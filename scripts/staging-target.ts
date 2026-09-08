export const PRODUCTION_REF = "rstkmkrsaicifdbfavxl";
export function stagingTarget(env: Record<string,string|undefined>) {
  const ref=env.STAGING_CONFIRMED_PROJECT_REF;
  if (!ref || !/^[a-z]{20}$/.test(ref) || ref===PRODUCTION_REF) throw Error("A distinct, explicitly confirmed staging project ref is required");
  const url=env.STAGING_SUPABASE_URL;
  if (url!==`https://${ref}.supabase.co`) throw Error("Staging URL must exactly match the confirmed non-production ref");
  const key=env.STAGING_SUPABASE_ANON_KEY;
  const serviceKey=env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !serviceKey || key===serviceKey) throw Error("Separate staging public and server credentials are required");
  return {ref,url,key,serviceKey};
}

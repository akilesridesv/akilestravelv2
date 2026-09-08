// READ ONLY public production catalog -> local staging seed plan. No remote writes.
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const source=process.env.VITE_SUPABASE_URL;
const key=process.env.VITE_SUPABASE_ANON_KEY;
assert.equal(source,'https://rstkmkrsaicifdbfavxl.supabase.co');
assert(key);
const fields='id,listing_type,title,description,highlights,whats_included,whats_not_included,what_to_bring,price_per_person,currency,min_capacity,max_capacity,duration_hours,languages,category,city,area,location_address,location_lat,location_lng,image_urls,featured_image,publication_status,is_active,registration_deadline_hours,event_date,cancellation_policy,country,department,tags,itinerary';
const approved={
  'e5f8b56c-1bce-4576-9ee8-4233260eb11c':{interests:['scooter','urbano','aventura','naturaleza'],desired_feelings:['desconexion'],social_style:['guided','small_group'],indoor_outdoor:['outdoor']},
  'ee6fda28-cc2e-4fdd-b5c3-93d0b601259a':{interests:['cafe','naturaleza','montana','cultura'],desired_feelings:['calma','conexion'],social_style:['guided'],indoor_outdoor:['outdoor']},
};
const query=new URLSearchParams({select:`${fields},provider_profiles(verification_status,booking_mode),recurring_schedules(id,activity_id,day_of_week,start_time,end_time,capacity,is_active,tier_ids),date_slots(id,activity_id,slot_date,start_time,end_time,capacity,status,tier_ids),ticket_tiers(id,activity_id,tier_name,description,price,quantity_available,quantity_sold)`,publication_status:'eq.published',is_active:'eq.true',id:`in.(${Object.keys(approved).join(',')})`,order:'id'});
const result=await fetch(`${source}/rest/v1/activities?${query}`,{headers:{apikey:key,Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(15000)});
if(!result.ok)throw Error(`Public catalog GET failed: ${result.status}`);
const rows=await result.json();
assert.equal(rows.length,2);
assert(rows.every(r=>approved[r.id] && r.provider_profiles?.verification_status==='approved'));
const ownerId='10000000-0000-4000-8000-000000000001';
const ident=s=>'"'+s.replaceAll('"','""')+'"';
const literal=s=>"'"+s.replaceAll("'","''")+"'";
const insert=(table,row)=>{
  const cols=Object.keys(row).map(ident).join(',');
  return `insert into public.${ident(table)} (${cols}) select ${cols} from jsonb_populate_record(null::public.${ident(table)},${literal(JSON.stringify(row))}::jsonb);`;
};
const sql=[`-- STAGING ONLY kbdrinaqoalldrjstxkg. Two approved metadata subsets; public facts only.
begin;
do $guard$ begin
  if exists(select 1 from public.activities) or exists(select 1 from auth.users) then
    raise exception 'Expected empty staging catalog and Auth; refusing overwrite';
  end if;
end $guard$;
insert into auth.users(id,email,raw_user_meta_data) values('${ownerId}','concierge-owner@example.invalid','{"name":"Staging catalog fixture"}'::jsonb);`];
for(const [index,row] of rows.entries()){
  const providerId=`20000000-0000-4000-8000-00000000000${index+1}`;
  // Separate synthetic owners/providers. No production user or provider IDs,
  // private contact details, bank accounts or payment credentials are copied.
  const userId=index ? '10000000-0000-4000-8000-000000000002' : ownerId;
  if(index)sql.push(`insert into auth.users(id,email,raw_user_meta_data) values('${userId}','concierge-owner-2@example.invalid','{"name":"Staging catalog fixture 2"}'::jsonb);`);
  sql.push(insert('provider_profiles',{id:providerId,user_id:userId,business_name:`Proveedor de pruebas ${index+1}`,verification_status:'approved',booking_mode:row.provider_profiles.booking_mode}));
  const {provider_profiles: _provider,recurring_schedules,date_slots,ticket_tiers,...activity}=row;
  sql.push(insert('activities',{...activity,created_by:userId,provider_profile_id:providerId,recommendation_metadata:approved[row.id]}));
  for(const [table,children] of Object.entries({recurring_schedules,date_slots,ticket_tiers}))for(const child of children)sql.push(insert(table,child));
}
sql.push('commit;');
await writeFile('.staging/public-catalog.json',JSON.stringify({capturedAt:new Date().toISOString(),sourceProject:'rstkmkrsaicifdbfavxl',targetProject:'kbdrinaqoalldrjstxkg',rows},null,2));
await writeFile('.staging/catalog-seed.sql',sql.join('\n\n')+'\n');
console.log(JSON.stringify({publicRecords:rows.length,schedules:rows.reduce((n,r)=>n+r.recurring_schedules.length,0),dateSlots:rows.reduce((n,r)=>n+r.date_slots.length,0),tiers:rows.reduce((n,r)=>n+r.ticket_tiers.length,0),remoteWrites:false}));

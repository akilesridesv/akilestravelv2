import { test } from "node:test";
import assert from "node:assert/strict";
import { localDatabase, migration } from "./postgres-fixture";
import { randomUUID } from "node:crypto";
test("checkout database guard blocks overselling, invalid departures and unsupported finite stock",async(t)=>{
  const db=await localDatabase(); t.after(()=>db.close());
  await db.exec(`alter table public.activities add is_active boolean default true, add publication_status text default 'published',
    add provider_profile_id uuid, add min_capacity integer default 1, add max_capacity integer default 4, add registration_deadline_hours integer default 2;
    create table public.provider_profiles(id uuid primary key, verification_status text);
    create table public.date_slots(activity_id uuid,slot_date date,start_time time,capacity int,status text);
    create table public.recurring_schedules(activity_id uuid,day_of_week int,start_time time,capacity int,is_active boolean);
    create table public.ticket_tiers(activity_id uuid,quantity_available int);
    create table public.bookings(id uuid primary key default gen_random_uuid(), activity_id uuid,number_of_people int,scheduled_date date,scheduled_time time,booking_status text);`);
  await db.exec(await migration("0014_booking_capacity_guard.sql"));
  await db.exec(await migration("0014_booking_capacity_guard.sql"));
  const id=randomUUID();
  await db.query("insert into public.activities(id) values($1)",[id]);
  await db.query("insert into public.date_slots values($1,'2099-09-12','14:00',100,'open')",[id]);
  const book=(size:number,date="2099-09-12",status="confirmed")=>db.query("insert into public.bookings(activity_id,number_of_people,scheduled_date,scheduled_time,booking_status) values($1,$2,$3,'14:00',$4) returning id",[id,size,date,status]);
  await assert.rejects(()=>book(0)); await assert.rejects(()=>book(1,"2099-09-13")); await assert.rejects(()=>book(1,"2000-01-01"));
  const attempts=await Promise.allSettled([book(3),book(3)]);
  assert.equal(attempts.filter(r=>r.status==="fulfilled").length,1);
  assert.equal((await db.query<{seats:number}>("select sum(number_of_people)::int seats from public.bookings")).rows[0].seats,3);
  await book(1); await assert.rejects(()=>book(1));
  await db.exec("update public.bookings set booking_status='cancelled'");
  await db.exec("update public.date_slots set status='blocked'"); await assert.rejects(()=>book(1));
  await db.exec("update public.date_slots set status='open'");
  await db.query("insert into public.ticket_tiers values($1,5)",[id]); await assert.rejects(()=>book(1));
  await db.exec("update public.ticket_tiers set quantity_available=0"); await book(1);
  await db.exec("update public.activities set is_active=false"); await assert.rejects(()=>book(1));
  // Cancellation remains possible after activity is withdrawn.
  await db.exec("update public.bookings set booking_status='cancelled'");
  const acl=(await db.query<{allowed:boolean}>("select has_function_privilege('anon','public.enforce_booking_capacity()','EXECUTE') allowed")).rows[0];
  assert.equal(acl.allowed,false);
});

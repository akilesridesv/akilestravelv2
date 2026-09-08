import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingCapacity, parseBookedSeats } from "../../src/lib/bookingAvailability";

test("checkout rejects unknown/malformed aggregate responses instead of assuming zero",()=>{
  for (const value of [null,undefined,"0",{},-1,1.5,NaN,Infinity]) assert.throws(()=>parseBookedSeats(value));
  assert.equal(parseBookedSeats(0),0); assert.equal(parseBookedSeats(3),3);
});
test("checkout cannot continue while availability is loading or failed",()=>{
  assert.equal(bookingCapacity(null,10,10,1).canBook,false);
  assert.equal(bookingCapacity(0,undefined,10,1).canBook,false);
  assert.equal(bookingCapacity(0,10,10,1).canBook,true);
});
test("checkout uses lower activity/slot capacity and respects group minimum",()=>{
  assert.deepEqual(bookingCapacity(7,100,8,2),{remaining:1,canBook:false});
  assert.deepEqual(bookingCapacity(3,4,8,1),{remaining:1,canBook:true});
  assert.deepEqual(bookingCapacity(9,4,8,1),{remaining:0,canBook:false});
});

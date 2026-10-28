#!/usr/bin/env node
import{occurrenceAt,nextOccurrence,parseStart}from"./schedule.js";
const args=Object.fromEntries(process.argv.slice(2).map((v,i,a)=>v.startsWith("--")?[v.slice(2),a[i+1]??true]:null).filter(Boolean));
try{
  const start=parseStart(args.start,args.timezone),schedule={cadence:String(args.cadence||"WEEKLY").toUpperCase(),timezone:args.timezone,startEpochMs:start.epochMs,anchorDay:start.anchorDay,occurrenceLimit:args.limit?Number(args.limit):null};
  console.log(JSON.stringify({start,next:nextOccurrence(schedule),firstThree:[0,1,2].map(i=>occurrenceAt(schedule,i)),disclosure:"Calendar preview only; no signing or broadcasting."},null,2));
}catch(error){console.error(error.message);process.exitCode=1;}

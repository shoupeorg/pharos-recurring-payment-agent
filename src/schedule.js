import{Temporal}from"@js-temporal/polyfill";

export function parseStart(local,timezone){
  if(typeof timezone!=="string"||!timezone)throw new Error("Explicit IANA timezone is required.");
  let plain;
  try{plain=Temporal.PlainDateTime.from(local);}catch{throw new Error("Start date/time is invalid.");}
  let zoned;
  try{zoned=plain.toZonedDateTime(timezone,{disambiguation:"compatible"});}catch{throw new Error("Timezone is invalid.");}
  return{epochMs:Number(zoned.epochMilliseconds),local:zoned.toPlainDateTime().toString(),utc:zoned.toInstant().toString(),timezone,anchorDay:plain.day};
}
export function occurrenceAt(schedule,index){
  if(!Number.isInteger(index)||index<0)throw new Error("Occurrence index is invalid.");
  const start=Temporal.Instant.fromEpochMilliseconds(schedule.startEpochMs).toZonedDateTimeISO(schedule.timezone);
  let due;
  if(schedule.cadence==="WEEKLY")due=start.add({weeks:index});
  else if(schedule.cadence==="MONTHLY"){
    const target=start.toPlainDateTime().with({day:1}).add({months:index});
    const day=Math.min(schedule.anchorDay,target.daysInMonth);
    due=target.with({day}).toZonedDateTime(schedule.timezone,{disambiguation:"compatible"});
  }else throw new Error("Cadence must be WEEKLY or MONTHLY.");
  return{index,epochMs:Number(due.epochMilliseconds),local:due.toPlainDateTime().toString(),utc:due.toInstant().toString(),timezone:schedule.timezone};
}
export function nextOccurrence(schedule,nowMs=Date.now()){
  const max=schedule.occurrenceLimit??10000;
  for(let i=0;i<max;i++){
    const due=occurrenceAt(schedule,i);
    if(schedule.endEpochMs&&due.epochMs>schedule.endEpochMs)return null;
    if(due.epochMs>=nowMs)return due;
  }
  return null;
}
export function dueOccurrences(schedule,afterMs,nowMs,limit=12){
  const out=[],max=schedule.occurrenceLimit??10000;
  for(let i=0;i<max&&out.length<limit;i++){
    const due=occurrenceAt(schedule,i);
    if(schedule.endEpochMs&&due.epochMs>schedule.endEpochMs)break;
    if(due.epochMs>nowMs)break;
    if(due.epochMs>afterMs)out.push(due);
  }
  return out;
}

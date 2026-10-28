import{LIMITS}from"./constants.js";
import{digest}from"./digest.js";
import{validateOccurrence}from"./engine.js";
import{dueOccurrences,nextOccurrence}from"./schedule.js";
import*as store from"./store.js";

const termsFor=(s,due)=>({scheduleId:s.scheduleId,revision:s.revision,sender:s.sender,recipient:s.recipient,asset:s.asset,tokenContract:s.tokenContract,amount:s.amount,scheduledAt:due.utc});
export async function dispatch(env,{source="CRON",nowMs=Date.now(),validator=validateOccurrence}={}){
  const invocationId=crypto.randomUUID(),detectedAt=new Date(nowMs).toISOString(),schedules=await store.activeSchedules(env.DB);let created=0,duplicates=0;
  for(const s of schedules){
    const due=dueOccurrences(s,s.lastScannedMs,nowMs,LIMITS.catchUp);
    for(const item of due){
      const key=await digest({scheduleId:s.scheduleId,revision:s.revision,scheduledAt:item.utc});
      const o={id:crypto.randomUUID(),key,workspaceId:s.workspaceId,scheduleId:s.scheduleId,revision:s.revision,index:item.index,scheduledAtMs:item.epochMs,scheduledLocal:item.local,timezone:item.timezone,detectedAt,state:"PENDING",group:"pending",provenance:source,terms:termsFor(s,item),updatedAt:detectedAt};
      if(await store.insertOccurrence(env.DB,o))created++;else duplicates++;
    }
    const next=nextOccurrence(s,nowMs+1);
    await store.updateScan(env.DB,s,nowMs,next?.epochMs??null);
  }
  const pending=await store.pendingOccurrences(env.DB);
  for(const candidate of pending){
    const claimed=await store.claimOccurrence(env.DB,candidate.id);if(!claimed)continue;
    try{const validation=await validator(claimed.terms);const state=validation.status==="VALIDATED"?"READY_FOR_REVIEW":validation.issues.some(x=>/INSUFFICIENT/.test(x.code))?"BLOCKED_INSUFFICIENT_FUNDS":"VALIDATION_FAILED";await store.saveValidation(env.DB,claimed.id,validation,state,validation.issues.map(x=>x.message).join(" "));}
    catch(error){await store.saveValidation(env.DB,claimed.id,{status:"ERROR",error:{message:error.message}},"VALIDATION_FAILED",error.message);}
  }
  const heartbeat={heartbeatAt:new Date().toISOString(),invocationId,source,schedulesScanned:schedules.length,occurrencesCreated:created,duplicatesIgnored:duplicates};
  await store.saveHeartbeat(env.DB,heartbeat);return heartbeat;
}

import{ENGINE_VERSION,LIMITS,NETWORK,REVIEW_TEXT,USDC}from"./constants.js";
import{dispatch}from"./dispatcher.js";
import{normalizeTerms,prepareUnsigned,reconcileOccurrence,reviewValidation,validateOccurrence}from"./engine.js";
import{jsonReport,markdownReport}from"./exports.js";
import{digest}from"./digest.js";
import{nextOccurrence,parseStart}from"./schedule.js";
import{parseUnitsExact}from"./math.js";
import*as store from"./store.js";

const json=(v,status=200)=>new Response(JSON.stringify(v,null,2),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const body=async r=>{try{return await r.json();}catch{throw Object.assign(new Error("Valid JSON body required."),{status:400});}};
const hash=async value=>digest({capability:value});
const rate=new Map();
function limited(ip){const n=Date.now(),e=rate.get(ip)||{n:0,start:n};if(n-e.start>60000){e.n=0;e.start=n;}e.n++;rate.set(ip,e);return e.n>LIMITS.ratePerMinute;}
async function auth(req,env){const id=req.headers.get("x-workspace-id"),cap=req.headers.get("x-workspace-capability");if(!id||!cap||!await store.authenticate(env.DB,id,await hash(cap)))throw Object.assign(new Error("Workspace authentication required."),{status:401});return id;}
function scheduleInput(raw,workspaceId,id=crypto.randomUUID(),revision=1,now=Date.now()){
  const base=normalizeTerms({sender:raw.sender,recipient:raw.recipient,asset:raw.asset,tokenContract:raw.tokenContract,amount:String(raw.amount||"")});
  if(base.asset==="PHRS")parseUnitsExact(base.amount,18);
  if(base.asset==="USDC")parseUnitsExact(base.amount,6);
  if(!raw.label||String(raw.label).length>80)throw new Error("A concise label is required.");
  const cadence=String(raw.cadence||"").toUpperCase();if(!["WEEKLY","MONTHLY"].includes(cadence))throw new Error("Cadence must be WEEKLY or MONTHLY.");
  const start=parseStart(raw.startLocal,raw.timezone);
  const end=raw.endLocal?parseStart(raw.endLocal,raw.timezone):null;
  if(end&&end.epochMs<start.epochMs)throw new Error("End date must not precede start date.");
  const occurrenceLimit=raw.occurrenceLimit==null||raw.occurrenceLimit===""?null:Number(raw.occurrenceLimit);
  if(occurrenceLimit!==null&&(!Number.isInteger(occurrenceLimit)||occurrenceLimit<1||occurrenceLimit>520))throw new Error("Occurrence limit must be 1 through 520.");
  const s={scheduleId:id,revision,workspaceId,active:true,label:String(raw.label),...base,cadence,timezone:raw.timezone,startEpochMs:start.epochMs,startLocal:start.local,anchorDay:start.anchorDay,endEpochMs:end?.epochMs??null,occurrenceLimit,lastScannedMs:start.epochMs-1,nextDueMs:start.epochMs,createdAt:new Date(now).toISOString()};
  return s;
}
async function occurrenceFor(req,env,id){const workspaceId=await auth(req,env),o=await store.getOccurrence(env.DB,workspaceId,id);if(!o)throw Object.assign(new Error("Occurrence not found."),{status:404});return o;}
async function manualOccurrence(env,s,workspaceId){
  const unresolved=await store.unresolvedForSchedule(env.DB,workspaceId,s.scheduleId);
  if(unresolved)throw Object.assign(new Error("Schedule already has unresolved occurrence "+unresolved.id+" in state "+unresolved.state+"."),{status:409});
  const now=Date.now(),instant={index:-1,epochMs:now,local:new Date(now).toISOString(),utc:new Date(now).toISOString(),timezone:s.timezone},key=await digest({scheduleId:s.scheduleId,revision:s.revision,manualAt:instant.utc});
  const o={id:crypto.randomUUID(),key,workspaceId,scheduleId:s.scheduleId,revision:s.revision,index:-1,scheduledAtMs:now,scheduledLocal:instant.local,timezone:s.timezone,detectedAt:instant.utc,state:"PENDING",group:"pending",provenance:"MANUAL_REVIEWER",terms:{scheduleId:s.scheduleId,revision:s.revision,sender:s.sender,recipient:s.recipient,asset:s.asset,tokenContract:s.tokenContract,amount:s.amount,scheduledAt:instant.utc},updatedAt:instant.utc};
  await store.insertOccurrence(env.DB,o);const claimed=await store.claimOccurrence(env.DB,o.id);
  try{const v=await validateOccurrence(claimed.terms),state=v.status==="VALIDATED"?"READY_FOR_REVIEW":v.issues.some(x=>/INSUFFICIENT/.test(x.code))?"BLOCKED_INSUFFICIENT_FUNDS":"VALIDATION_FAILED";await store.saveValidation(env.DB,o.id,v,state,v.issues.map(x=>x.message).join(" "));}catch(error){await store.saveValidation(env.DB,o.id,{status:"ERROR",error:{message:error.message}},"VALIDATION_FAILED",error.message);}
  return store.getOccurrence(env.DB,workspaceId,o.id);
}

export default{
  async scheduled(controller,env,ctx){ctx.waitUntil(dispatch(env,{source:"CRON",nowMs:controller.scheduledTime}));},
  async fetch(request,env){
    const url=new URL(request.url);
    try{
      if(url.pathname.startsWith("/api/")&&limited(request.headers.get("cf-connecting-ip")||"local"))return json({error:"Rate limit exceeded."},429);
      if(url.pathname==="/api/meta")return json({engineVersion:ENGINE_VERSION,network:NETWORK,reviewStatement:REVIEW_TEXT,usdc:USDC,unsignedOnly:true,signing:false,broadcast:false,catchUpLimit:LIMITS.catchUp});
      if(url.pathname==="/api/workspaces"&&request.method==="POST"){const id=crypto.randomUUID(),capability=(crypto.randomUUID()+crypto.randomUUID()).replace(/-/g,""),now=new Date().toISOString();await store.createWorkspace(env.DB,id,await hash(capability),now);return json({workspaceId:id,capability},201);}
      if(url.pathname==="/api/schedules"&&request.method==="POST"){const workspaceId=await auth(request,env);if(await store.countActive(env.DB,workspaceId)>=LIMITS.activeSchedules)throw Object.assign(new Error("Active schedule limit reached."),{status:409});const s=scheduleInput(await body(request),workspaceId);return json({...await store.createSchedule(env.DB,s),next:nextOccurrence(s)},201);}
      if(url.pathname==="/api/schedules"&&request.method==="GET"){const workspaceId=await auth(request,env);return json({schedules:await store.listSchedules(env.DB,workspaceId),heartbeat:await store.heartbeat(env.DB)});}
      const sm=url.pathname.match(/^\/api\/schedules\/([^/]+)(?:\/(revise|pause|resume|prepare-now))?$/);
      if(sm){const workspaceId=await auth(request,env),current=await store.latestSchedule(env.DB,workspaceId,sm[1]);if(!current)throw Object.assign(new Error("Schedule not found."),{status:404});const action=sm[2];if(!action&&request.method==="GET")return json({...current,next:nextOccurrence(current)});if(action==="pause"&&request.method==="POST")return json(await store.setActive(env.DB,workspaceId,current.scheduleId,false));if(action==="resume"&&request.method==="POST")return json(await store.setActive(env.DB,workspaceId,current.scheduleId,true));if(action==="revise"&&request.method==="POST"){const revised=scheduleInput(await body(request),workspaceId,current.scheduleId,current.revision+1);return json({...await store.reviseSchedule(env.DB,current,revised),next:nextOccurrence(revised)});}if(action==="prepare-now"&&request.method==="POST")return json(await manualOccurrence(env,current,workspaceId),201);}
      if(url.pathname==="/api/occurrences"&&request.method==="GET"){const workspaceId=await auth(request,env);return json({occurrences:await store.listOccurrences(env.DB,workspaceId)});}
      const om=url.pathname.match(/^\/api\/occurrences\/([^/]+)(?:\/(review|prepare|attach|reconcile|revalidate|export))?$/);
      if(om){let o=await occurrenceFor(request,env,om[1]),action=om[2];if(!action&&request.method==="GET")return json(o);if(action==="revalidate"&&request.method==="POST"){const claimed=await store.claimRevalidation(env.DB,o.workspaceId,o.id);if(!claimed)throw Object.assign(new Error("Only a blocked or validation-failed occurrence can be revalidated."),{status:409});try{const v=await validateOccurrence(claimed.terms),state=v.status==="VALIDATED"?"READY_FOR_REVIEW":v.issues.some(x=>/INSUFFICIENT/.test(x.code))?"BLOCKED_INSUFFICIENT_FUNDS":"VALIDATION_FAILED";await store.saveValidation(env.DB,o.id,v,state,v.issues.map(x=>x.message).join(" "));}catch(error){await store.saveValidation(env.DB,o.id,{status:"ERROR",error:{message:error.message}},"VALIDATION_FAILED",error.message);}return json(await occurrenceFor(request,env,o.id));}if(action==="review"&&request.method==="POST"){const b=await body(request),review=await reviewValidation(o.validation,b.accepted===true);await store.saveReview(env.DB,o.id,review);return json(await occurrenceFor(request,env,o.id));}if(action==="prepare"&&request.method==="POST"){const earlier=await store.earlierUnresolved(env.DB,o);if(earlier)throw Object.assign(new Error("Earlier occurrence "+earlier.id+" remains "+earlier.state+"; additional payable export is withheld."),{status:409});const fresh=await validateOccurrence(o.terms),unsigned=await prepareUnsigned(o.validation,o.review,fresh);await store.saveUnsigned(env.DB,o.id,unsigned);return json(await occurrenceFor(request,env,o.id));}if(action==="attach"&&request.method==="POST"){const b=await body(request),txHash=String(b.hash||"");if(!/^0x[0-9a-fA-F]{64}$/.test(txHash))throw new Error("Transaction hash is invalid.");const saved=await store.attachHash(env.DB,o.workspaceId,o.id,txHash);if(!saved)throw Object.assign(new Error("Occurrence is not eligible for hash attachment."),{status:409});return json(saved);}if(action==="reconcile"&&request.method==="POST"){if(!o.transactionHash)throw Object.assign(new Error("Attach a transaction hash first."),{status:409});const result=await reconcileOccurrence(o,o.transactionHash),saved=await store.saveReconciliation(env.DB,o.id,o.transactionHash,result);return json(saved||o);}if(action==="export"&&request.method==="GET"){const s=await store.latestSchedule(env.DB,o.workspaceId,o.scheduleId),format=url.searchParams.get("format")==="md"?"md":"json",text=format==="md"?markdownReport(s,o):jsonReport(s,o);return new Response(text,{headers:{"content-type":format==="md"?"text/markdown; charset=utf-8":"application/json; charset=utf-8","content-disposition":`attachment; filename=occurrence-${o.id}.${format}`}});}}
      return env.ASSETS.fetch(request);
    }catch(error){return json({error:error.message||"Unexpected error."},error.status||400);}
  }
};

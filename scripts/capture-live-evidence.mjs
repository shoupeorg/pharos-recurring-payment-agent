import{mkdir,readFile,writeFile}from"node:fs/promises";
import{existsSync}from"node:fs";
import{validateOccurrence}from"../src/engine.js";
const sender="0x15ddce897d76ac39c188ade4d353711a60395315",recipient="0x4117b9737f64d816be36f6c18c72409c98e4737c";
const dir=new URL("../evidence/",import.meta.url),pub=new URL("../public/evidence/",import.meta.url);await mkdir(dir,{recursive:true});await mkdir(pub,{recursive:true});
async function save(name,producer){const target=new URL(name,dir);let value;if(existsSync(target))value=JSON.parse(await readFile(target,"utf8"));else{value=await producer();await writeFile(target,JSON.stringify(value,null,2)+"\n");}await writeFile(new URL(name,pub),JSON.stringify(value,null,2)+"\n");return value;}
const success=await save("v1-live-native-ready.json",()=>validateOccurrence({scheduleId:"evidence-weekly",revision:1,sender,recipient,asset:"PHRS",amount:"0.000001",scheduledAt:new Date().toISOString()}));
const insufficient=await save("v1-live-insufficient.json",()=>validateOccurrence({scheduleId:"evidence-insufficient",revision:1,sender,recipient,asset:"USDC",tokenContract:"0xc879c018db60520f4355c26ed1a6d572cdac1815",amount:"999999999",scheduledAt:new Date().toISOString()}));
const simulated=await save("v1-simulated-reconciliation-cases.json",async()=>({evidenceClass:"SIMULATED",purpose:"Deterministic receipt edge-case tests only",cases:["pending receipt remains AWAITING_CONFIRMATION","reverted receipt becomes FAILED_ONCHAIN","wrong sender/amount rejected","duplicate hash constrained by D1"]}));
const manifest={evidenceVersion:"1",engineVersion:"recurring-payment-agent/1.0.0",capturedAt:new Date().toISOString(),readOnly:true,noSigning:true,noBroadcast:true,files:["mcp-schemas-v1.json","v1-live-native-ready.json","v1-live-insufficient.json","v1-simulated-reconciliation-cases.json"],summary:{native:success.status,insufficient:insufficient.status,simulated:simulated.evidenceClass,scheduler:"PENDING_DEPLOYED_CRON_PROOF"}};
await save("manifest.json",async()=>manifest);console.log(JSON.stringify(manifest,null,2));

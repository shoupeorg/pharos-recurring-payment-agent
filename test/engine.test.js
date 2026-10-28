import test from"node:test";import assert from"node:assert/strict";import{encodeFunctionResult,encodeEventTopics,encodeAbiParameters}from"viem";
import{ERC20_ABI,USDC}from"../src/constants.js";
import{prepareUnsigned,reconcileOccurrence,reviewValidation,validateOccurrence}from"../src/engine.js";
const sender="0x15ddce897d76ac39c188ade4d353711a60395315",recipient="0x4117b9737f64d816be36f6c18c72409c98e4737c";
const terms=(asset="PHRS")=>({scheduleId:"s",revision:1,sender,recipient,asset,tokenContract:asset==="PHRS"?null:USDC.address,amount:"0.000001",scheduledAt:"2026-10-28T00:00:00Z"});
const tools=["get_balance","get_code","eth_call"].map(name=>({name,inputSchema:{properties:{block:{}}}}));
function adapter(overrides={}){
  let calls=0;
  return{tools,call:async(name,args)=>{
    if(name==="get_chain_info")return{chainId:1672};
    if(name==="get_block_number")return{blockNumberHex:"0x100"};
    if(name==="get_balance")return{balanceWei:overrides.native??"1000000000000000000"};
    if(name==="get_gas_price")return overrides.gasPrice??{gasPriceWei:"10000000000"};
    if(name==="get_code")return{code:"0x6000"};
    if(name==="estimate_gas"){if(overrides.estimateError)throw new Error(overrides.estimateError);return{gas:"21000"}}
    if(name==="eth_call"){
      calls++;
      if(overrides.callError)throw new Error(overrides.callError);
      if(args.transaction.data?.startsWith("0x313ce567"))return{result:encodeFunctionResult({abi:ERC20_ABI,functionName:"decimals",result:6})};
      if(args.transaction.data?.startsWith("0x95d89b41"))return{result:encodeFunctionResult({abi:ERC20_ABI,functionName:"symbol",result:"USDC"})};
      if(args.transaction.data?.startsWith("0x70a08231"))return{result:encodeFunctionResult({abi:ERC20_ABI,functionName:"balanceOf",result:BigInt(overrides.token??"1000000")})};
      if(args.transaction.data?.startsWith("0xa9059cbb"))return{result:overrides.transferResult??encodeFunctionResult({abi:ERC20_ABI,functionName:"transfer",result:true})};
      return{result:"0x"};
    }
    throw new Error("Unexpected "+name);
  }};
}
test("native validation is exact and sufficient",async()=>{const v=await validateOccurrence(terms(),adapter());assert.equal(v.status,"VALIDATED");assert.equal(v.terms.atomicAmount,"1000000000000");assert.equal(v.transaction.to,recipient);assert.equal(v.transaction.value,"0xe8d4a51000")});
test("USDC validation encodes one atomic unit",async()=>{const v=await validateOccurrence(terms("USDC"),adapter());assert.equal(v.status,"VALIDATED");assert.equal(v.terms.atomicAmount,"1");assert.equal(v.transaction.to,USDC.address)});
test("excess precision is rejected",async()=>{const t=terms("USDC");t.amount="0.0000001";await assert.rejects(()=>validateOccurrence(t,adapter()),/precision/)});
test("insufficient token and gas are distinct",async()=>{let v=await validateOccurrence({...terms("USDC"),amount:"2"},adapter({token:"1"}));assert.equal(v.status,"BLOCKED");assert.match(v.issues[0].code,/TOKEN/);v=await validateOccurrence(terms("USDC"),adapter({native:"1"}));assert(v.issues.some(x=>x.code==="INSUFFICIENT_GAS_FUNDS"))});
test("missing gas price is not zero and blocks by error",async()=>{await assert.rejects(()=>validateOccurrence(terms(),adapter({gasPrice:{}})),/unavailable/)});
test("transport error is not described as onchain revert",async()=>{const v=await validateOccurrence(terms(),adapter({callError:"fetch failed timeout"}));assert.equal(v.simulation.kind,"TRANSPORT_ERROR");assert.equal(v.status,"BLOCKED")});
test("review, expiry and tamper gate",async()=>{const v=await validateOccurrence(terms(),adapter());const r=await reviewValidation(v,true);const u=await prepareUnsigned(v,r,v);assert.equal(u.unsigned,true);await assert.rejects(()=>prepareUnsigned(v,{...r,paymentDigest:"0xdead"},v),/changed/);await assert.rejects(()=>reviewValidation({...v,observation:{...v.observation,expiresAt:"2000-01-01T00:00:00Z"}},true),/expired/)});
test("false ERC20 return blocks preparation",async()=>{const falseResult=encodeFunctionResult({abi:ERC20_ABI,functionName:"transfer",result:false}),v=await validateOccurrence(terms("USDC"),adapter({transferResult:falseResult}));assert.equal(v.status,"BLOCKED");assert.equal(v.simulation.kind,"ERC20_FALSE")});
const occurrence=(asset="PHRS")=>({terms:{...terms(asset),atomicAmount:asset==="PHRS"?"1000000000000":"1"},unsignedTransaction:{transaction:{from:sender,to:asset==="PHRS"?recipient:USDC.address,value:asset==="PHRS"?"0xe8d4a51000":"0x0",data:asset==="PHRS"?"0x":"0xa9059cbb0000000000000000000000004117b9737f64d816be36f6c18c72409c98e4737c0000000000000000000000000000000000000000000000000000000000000001"}}});
function receiptAdapter({status="0x1",from=sender,to=recipient,value="0xe8d4a51000",hash="0x"+"1".repeat(64),logs=[]}={}){return{tools:[],call:async name=>name==="get_chain_info"?{chainId:1672}:name==="get_transaction"?{hash,from,to,value,input:"0x"}:name==="get_transaction_receipt"?{transactionHash:hash,status,blockNumber:"0xf0",logs}:name==="get_block_number"?{blockNumberHex:"0x100"}:null}}
test("pending receipt remains pending",async()=>{const a=receiptAdapter();a.call=async name=>name==="get_chain_info"?{chainId:1672}:null;const r=await reconcileOccurrence(occurrence(),"0x"+"1".repeat(64),a);assert.equal(r.state,"AWAITING_CONFIRMATION")});
test("reverted receipt is failed onchain",async()=>{const r=await reconcileOccurrence(occurrence(),"0x"+"1".repeat(64),receiptAdapter({status:"0x0"}));assert.equal(r.state,"FAILED_ONCHAIN")});
test("wrong sender or amount rejects",async()=>{await assert.rejects(()=>reconcileOccurrence(occurrence(),"0x"+"1".repeat(64),receiptAdapter({from:recipient})),/sender/);await assert.rejects(()=>reconcileOccurrence(occurrence(),"0x"+"1".repeat(64),receiptAdapter({value:"0x1"})),/value/)});
test("successful native receipt becomes paid after confirmations",async()=>{const r=await reconcileOccurrence(occurrence(),"0x"+"1".repeat(64),receiptAdapter());assert.equal(r.state,"PAID");assert(r.confirmations>1)});
test("source exposes no signing or broadcasting endpoint",async()=>{const src=await import("node:fs/promises").then(fs=>fs.readFile(new URL("../src/worker.js",import.meta.url),"utf8"));assert(!/send_raw_transaction|private.?key|signTransaction/i.test(src))});

import{decodeEventLog,decodeFunctionData,decodeFunctionResult,encodeFunctionData,getAddress,isAddress}from"viem";
import{ENGINE_VERSION,ERC20_ABI,LIMITS,NETWORK,REVIEW_TEXT,USDC}from"./constants.js";
import{digest}from"./digest.js";
import{bigint,hex,parseUnitsExact}from"./math.js";
import{withChainMcp}from"./mcp.js";

const cleanAddress=(value,label)=>{
  if(typeof value!=="string"||!isAddress(value,{strict:false}))throw new Error(label+" is not a valid EVM address.");
  const out=getAddress(value).toLowerCase();
  if(/^0x0{40}$/.test(out))throw new Error(label+" cannot be the zero address.");
  return out;
};
const blockCapable=(tools,name)=>Object.hasOwn(tools.find(x=>x.name===name)?.inputSchema?.properties||{},"block");
const unwrap=(value,key)=>value?.[key]??value;
const toolError=e=>{const m=String(e?.message||e),code=e?.code??null;return{kind:/execution reverted|\brevert(?:ed)?\b/i.test(m)||code===3?"EVM_REVERT":/timeout|fetch failed|network|429|rate/i.test(m)?"TRANSPORT_ERROR":"RPC_ERROR",message:m,code,data:e?.data??null};};
async function shaTerms(terms){return digest({sender:terms.sender,recipient:terms.recipient,asset:terms.asset,tokenContract:terms.tokenContract||null,amount:terms.amount,atomicAmount:terms.atomicAmount,chainId:NETWORK.chainId,scheduledAt:terms.scheduledAt,scheduleId:terms.scheduleId,revision:terms.revision});}

export function normalizeTerms(input){
  const asset=String(input.asset||"").toUpperCase();
  if(!["PHRS","USDC","CUSTOM"].includes(asset))throw new Error("Asset must be PHRS, USDC, or CUSTOM.");
  const sender=cleanAddress(input.sender,"Sender"),recipient=cleanAddress(input.recipient,"Recipient");
  let tokenContract=null,decimals=asset==="PHRS"?18:asset==="USDC"?6:null;
  if(asset==="USDC")tokenContract=USDC.address;
  if(asset==="CUSTOM")tokenContract=cleanAddress(input.tokenContract,"Token contract");
  return{...input,sender,recipient,asset,tokenContract,decimals};
}

export async function validateOccurrence(input,injected=null,now=new Date()){
  const terms=normalizeTerms(input),trace=[];
  const run=async({call,tools})=>{
    const invoke=async(name,args={},pinned=false)=>{const startedAt=new Date().toISOString();try{const result=await call(name,args);if(result?.error)throw Object.assign(new Error(result.error.message||"RPC error."),result.error);trace.push({name,args,pinned,startedAt,completedAt:new Date().toISOString(),status:"OK"});return result;}catch(error){trace.push({name,args,pinned,startedAt,completedAt:new Date().toISOString(),status:"FAILED",error:toolError(error)});throw error;}};
    const chain=await invoke("get_chain_info");
    if(Number(chain.chainId)!==NETWORK.chainId)throw new Error("Chain MCP returned the wrong network.");
    const latest=await invoke("get_block_number"),blockHex=latest.blockNumberHex??latest.blockNumber??latest.number;
    if(blockHex==null)throw new Error("Observation block is unavailable.");
    const pin=(name,args)=>blockCapable(tools,name)?{...args,block:blockHex}:args;
    const nativeRaw=await invoke("get_balance",pin("get_balance",{address:terms.sender}),blockCapable(tools,"get_balance"));
    const gasRaw=await invoke("get_gas_price");
    const nativeBalance=bigint(String(nativeRaw.balanceWei??nativeRaw.balance??""),"Native balance");
    const gasPrice=bigint(String(gasRaw.gasPriceWei??gasRaw.gasPrice??""),"Gas price");
    let decimals=terms.decimals,symbol=terms.asset,tokenBalance=null,tx,simulation;
    if(terms.asset==="PHRS"){
      terms.atomicAmount=parseUnitsExact(terms.amount,18).toString();
      tx={from:terms.sender,to:terms.recipient,value:hex(terms.atomicAmount),data:"0x"};
    }else{
      const code=await invoke("get_code",pin("get_code",{address:terms.tokenContract}),blockCapable(tools,"get_code"));
      if(!code.code||code.code==="0x"||code.code==="0x0")throw new Error("Token contract bytecode is unavailable.");
      const read=async(name,args=[])=>{const data=encodeFunctionData({abi:ERC20_ABI,functionName:name,args});const raw=await invoke("eth_call",pin("eth_call",{transaction:{to:terms.tokenContract,data}}),blockCapable(tools,"eth_call"));return decodeFunctionResult({abi:ERC20_ABI,functionName:name,data:raw.result});};
      if(terms.asset==="CUSTOM"){decimals=Number(await read("decimals"));symbol=String(await read("symbol"));if(!Number.isInteger(decimals)||decimals<0||decimals>255||!symbol)throw new Error("Custom token metadata is invalid.");}
      tokenBalance=BigInt(await read("balanceOf",[terms.sender]));
      terms.atomicAmount=parseUnitsExact(terms.amount,decimals).toString();
      const data=encodeFunctionData({abi:ERC20_ABI,functionName:"transfer",args:[terms.recipient,BigInt(terms.atomicAmount)]});
      const decoded=decodeFunctionData({abi:ERC20_ABI,data});
      if(String(decoded.args[0]).toLowerCase()!==terms.recipient||decoded.args[1].toString()!==terms.atomicAmount)throw new Error("ERC-20 calldata round-trip failed.");
      tx={from:terms.sender,to:terms.tokenContract,value:"0x0",data};
    }
    try{
      const raw=await invoke("eth_call",pin("eth_call",{transaction:tx}),blockCapable(tools,"eth_call"));
      if(terms.asset==="PHRS")simulation={kind:"SUCCESS",returnData:raw.result??null};
      else if(!raw.result||raw.result==="0x")simulation={kind:"MALFORMED_RETURN",returnData:raw.result??null};
      else{const ok=decodeFunctionResult({abi:ERC20_ABI,functionName:"transfer",data:raw.result});simulation={kind:ok===true?"SUCCESS":"ERC20_FALSE",returnData:raw.result};}
    }catch(error){simulation=toolError(error);}
    let estimate=null,estimateError=null;
    try{const raw=await invoke("estimate_gas",{transaction:tx});estimate=bigint(String(raw.gas??raw.gasEstimate??""),"Gas estimate");}catch(error){estimateError=toolError(error);}
    const buffered=estimate===null?null:(estimate*12000n+9999n)/10000n,maxGas=buffered===null?null:buffered*gasPrice,amount=BigInt(terms.atomicAmount),issues=[];
    if(simulation.kind!=="SUCCESS")issues.push({code:simulation.kind,message:simulation.message||"Simulation did not establish payment success."});
    if(estimate===null||maxGas===null)issues.push({code:"GAS_UNAVAILABLE",message:estimateError?.message||"Gas estimate is unavailable."});
    if(terms.asset==="PHRS"&&maxGas!==null&&nativeBalance<amount+maxGas)issues.push({code:"INSUFFICIENT_NATIVE_FUNDS",message:"Native balance cannot cover value plus buffered gas."});
    if(terms.asset!=="PHRS"&&tokenBalance<amount)issues.push({code:"INSUFFICIENT_TOKEN_FUNDS",message:"Token balance is insufficient."});
    if(terms.asset!=="PHRS"&&maxGas!==null&&nativeBalance<maxGas)issues.push({code:"INSUFFICIENT_GAS_FUNDS",message:"Native balance cannot cover buffered gas."});
    const normalizedTerms={...terms,decimals,symbol,atomicAmount:terms.atomicAmount},paymentDigest=await shaTerms(normalizedTerms);
    const validation={id:crypto.randomUUID(),engineVersion:ENGINE_VERSION,status:issues.length?"BLOCKED":"VALIDATED",terms:normalizedTerms,paymentDigest,transaction:tx,simulation,issues,balances:{nativeWei:nativeBalance.toString(),tokenAtomic:tokenBalance?.toString()??null},gas:{estimate:estimate?.toString()??null,bufferedLimit:buffered?.toString()??null,gasPriceWei:gasPrice.toString(),maximumCostWei:maxGas?.toString()??null},observation:{capturedAt:now.toISOString(),block:String(blockHex),balancePinned:blockCapable(tools,"get_balance"),callPinned:blockCapable(tools,"eth_call"),estimatePinned:false,gasPricePinned:false,expiresAt:new Date(now.getTime()+LIMITS.validationTtlMs).toISOString()},trace,disclosure:"NOT SENT / NO SIGNATURE"};
    validation.validationDigest=await digest({paymentDigest,status:validation.status,observation:validation.observation,balances:validation.balances,gas:validation.gas,simulation});
    return validation;
  };
  return injected?run(injected):withChainMcp(run);
}

export async function reviewValidation(validation,accepted,now=new Date()){
  if(!accepted||validation?.status!=="VALIDATED")throw Object.assign(new Error("A successful validation and explicit review are required."),{status:409});
  if(Date.parse(validation.observation.expiresAt)<=now.getTime())throw Object.assign(new Error("Validation expired."),{status:409});
  return{accepted:true,statement:REVIEW_TEXT,paymentDigest:validation.paymentDigest,validationDigest:validation.validationDigest,reviewedAt:now.toISOString()};
}
export async function prepareUnsigned(previous,review,fresh,now=new Date()){
  if(previous?.status!=="VALIDATED"||fresh?.status!=="VALIDATED"||!review?.accepted)throw Object.assign(new Error("Fresh validated review is required."),{status:409});
  if(Date.parse(previous.observation.expiresAt)<=now.getTime())throw Object.assign(new Error("Reviewed validation expired."),{status:409});
  if(review.paymentDigest!==previous.paymentDigest||review.validationDigest!==previous.validationDigest||fresh.paymentDigest!==previous.paymentDigest)throw Object.assign(new Error("Payment terms or reviewed validation changed."),{status:409});
  const tx=fresh.transaction;
  return{kind:"UNSIGNED_TRANSACTION",unsigned:true,signed:false,broadcast:false,paymentDigest:fresh.paymentDigest,preparedAt:now.toISOString(),transaction:{chainId:NETWORK.chainId,from:tx.from,to:tx.to,value:tx.value,data:tx.data,gas:hex(fresh.gas.bufferedLimit)},walletMustPopulate:["nonce","fee fields"],warning:"PREPARED IS NOT PAID. Pause cannot invalidate a downloaded transaction."};
}

export async function reconcileOccurrence(occurrence,hash,injected=null,now=new Date()){
  if(!/^0x[0-9a-fA-F]{64}$/.test(hash))throw new Error("Transaction hash is invalid.");
  const run=async({call})=>{
    const chain=await call("get_chain_info",{});if(Number(chain.chainId)!==NETWORK.chainId)throw new Error("Wrong chain.");
    let tx,receipt;
    try{tx=unwrap(await call("get_transaction",{hash}),"transaction");receipt=unwrap(await call("get_transaction_receipt",{hash}),"receipt");}catch(error){return{state:"RECONCILIATION_REQUIRED",hash,error:toolError(error),checkedAt:now.toISOString()};}
    if(!tx||!receipt)return{state:"AWAITING_CONFIRMATION",hash,checkedAt:now.toISOString(),reason:"Transaction or receipt is not yet available."};
    if(String(receipt.transactionHash||receipt.hash).toLowerCase()!==hash.toLowerCase()||String(tx.hash).toLowerCase()!==hash.toLowerCase())throw new Error("Transaction and receipt identities do not match.");
    const expected=occurrence.unsignedTransaction.transaction;
    if(String(tx.from).toLowerCase()!==expected.from||String(tx.to).toLowerCase()!==expected.to)throw new Error("Transaction sender or destination does not match the occurrence.");
    if(String(receipt.status).toLowerCase()==="0x0"||receipt.status===0)return{state:"FAILED_ONCHAIN",hash,checkedAt:now.toISOString(),receipt};
    if(String(receipt.status).toLowerCase()!=="0x1"&&receipt.status!==1)return{state:"AWAITING_CONFIRMATION",hash,checkedAt:now.toISOString(),reason:"Receipt status is unknown."};
    if(BigInt(tx.value||"0x0")!==BigInt(expected.value))throw new Error("Transaction value does not match.");
    if(occurrence.terms.asset!=="PHRS"){
      const decoded=decodeFunctionData({abi:ERC20_ABI,data:tx.input||tx.data});
      if(decoded.functionName!=="transfer"||String(decoded.args[0]).toLowerCase()!==occurrence.terms.recipient||decoded.args[1].toString()!==occurrence.terms.atomicAmount)throw new Error("ERC-20 transfer calldata does not match.");
      const matched=(receipt.logs||[]).some(log=>{try{const e=decodeEventLog({abi:ERC20_ABI,data:log.data,topics:log.topics});return e.eventName==="Transfer"&&String(log.address).toLowerCase()===occurrence.terms.tokenContract&&String(e.args.from).toLowerCase()===occurrence.terms.sender&&String(e.args.to).toLowerCase()===occurrence.terms.recipient&&e.args.value.toString()===occurrence.terms.atomicAmount;}catch{return false;}});
      if(!matched)throw new Error("Matching ERC-20 Transfer evidence was not found.");
    }else if(BigInt(tx.value)!==BigInt(occurrence.terms.atomicAmount))throw new Error("Native payment amount does not match.");
    const latest=await call("get_block_number",{}),latestNumber=BigInt(latest.blockNumberHex??latest.blockNumber??latest.number),mined=BigInt(receipt.blockNumber),confirmations=Number(latestNumber-mined+1n);
    if(confirmations<LIMITS.confirmations)return{state:"AWAITING_CONFIRMATION",hash,confirmations,checkedAt:now.toISOString(),receipt};
    return{state:"PAID",hash,confirmations,checkedAt:now.toISOString(),receipt};
  };
  return injected?run(injected):withChainMcp(run);
}

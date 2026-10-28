export function parseUnitsExact(value,decimals){
  if(typeof value!=="string"||!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value))throw new Error("Amount must be a plain positive decimal string.");
  const [whole,fraction=""]=value.split(".");
  if(fraction.length>decimals)throw new Error(`Amount exceeds token precision of ${decimals} decimals.`);
  const atomic=BigInt(whole)*10n**BigInt(decimals)+BigInt((fraction+"0".repeat(decimals)).slice(0,decimals)||"0");
  if(atomic<=0n)throw new Error("Amount must be greater than zero.");
  return atomic;
}
export function hex(value){return "0x"+BigInt(value).toString(16);}
export function bigint(value,label){
  if(typeof value==="bigint")return value;
  if(typeof value!=="string"||!value.length)throw new Error(label+" is unavailable.");
  try{return BigInt(value);}catch{throw new Error(label+" is malformed.");}
}

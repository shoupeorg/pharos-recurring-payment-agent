function stable(value){
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==="object")return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
  return value;
}
export async function digest(value){
  const bytes=new TextEncoder().encode(JSON.stringify(stable(value)));
  const hash=await crypto.subtle.digest("SHA-256",bytes);
  return "0x"+[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,"0")).join("");
}

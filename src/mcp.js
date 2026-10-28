import{Client}from"@modelcontextprotocol/sdk/client/index.js";
import{StreamableHTTPClientTransport}from"@modelcontextprotocol/sdk/client/streamableHttp.js";
import{NETWORK}from"./constants.js";

export function parseToolResult(result,tool){
  if(result?.isError){const text=result.content?.find(x=>x.type==="text")?.text||tool+" failed.";throw Object.assign(new Error(text),{kind:"MCP_TOOL_ERROR"});}
  const text=result?.content?.find(x=>x.type==="text")?.text;
  if(!text)throw new Error(tool+" returned no JSON text.");
  try{return JSON.parse(text);}catch{throw new Error(tool+" returned malformed JSON.");}
}
const transient=e=>/timeout|fetch failed|capacity|429|rate limit/i.test(String(e?.message||e));
export async function withChainMcp(run){
  let last;
  for(let attempt=1;attempt<=3;attempt++){
    const client=new Client({name:"pharos-recurring-payment-agent",version:"1.0.0"});
    const transport=new StreamableHTTPClientTransport(new URL(NETWORK.mcpUrl),{fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(25000)})});
    try{
      await client.connect(transport);
      const listed=await client.listTools(),tools=listed.tools.map(x=>({name:x.name,description:x.description,inputSchema:x.inputSchema}));
      const call=async(name,args={})=>parseToolResult(await client.callTool({name,arguments:args}),name);
      return await run({call,tools});
    }catch(error){last=error;if(attempt===3||!transient(error))throw error;}
    finally{try{await transport.terminateSession()}catch{}try{await client.close()}catch{}}
  }
  throw last;
}

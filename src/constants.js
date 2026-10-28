export const ENGINE_VERSION="recurring-payment-agent/1.0.0";
export const NETWORK={name:"Pharos Pacific Mainnet",chainId:1672,nativeSymbol:"PHRS",mcpUrl:"https://mcp.pharos.xyz/mcp"};
export const USDC={address:"0xc879c018db60520f4355c26ed1a6d572cdac1815",symbol:"USDC",decimals:6};
export const REVIEW_TEXT="I reviewed the immutable occurrence terms and understand this export is unsigned and not paid.";
export const LIMITS={activeSchedules:10,catchUp:12,validationTtlMs:10*60*1000,confirmations:1,ratePerMinute:90};
export const TERMINAL_STATES=new Set(["PAID","FAILED_ONCHAIN"]);
export const GROUPS={
  paid:new Set(["PAID"]),
  failed:new Set(["BLOCKED_INSUFFICIENT_FUNDS","VALIDATION_FAILED","FAILED_ONCHAIN","RECONCILIATION_REQUIRED"]),
  pending:new Set(["PENDING","VALIDATING","READY_FOR_REVIEW","PREPARED_UNSIGNED","AWAITING_CONFIRMATION"])
};
export const ERC20_ABI=[
  {type:"function",name:"decimals",stateMutability:"view",inputs:[],outputs:[{type:"uint8"}]},
  {type:"function",name:"symbol",stateMutability:"view",inputs:[],outputs:[{type:"string"}]},
  {type:"function",name:"balanceOf",stateMutability:"view",inputs:[{name:"account",type:"address"}],outputs:[{type:"uint256"}]},
  {type:"function",name:"transfer",stateMutability:"nonpayable",inputs:[{name:"to",type:"address"},{name:"amount",type:"uint256"}],outputs:[{type:"bool"}]},
  {type:"event",name:"Transfer",inputs:[{name:"from",type:"address",indexed:true},{name:"to",type:"address",indexed:true},{name:"value",type:"uint256",indexed:false}]}
];

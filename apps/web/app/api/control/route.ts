import {NextRequest} from 'next/server';
import handler from '../../../../../api/control.mjs';
export const runtime='nodejs';export async function POST(req:NextRequest){let status=200;const headers=new Headers();const response={setHeader:(k:string,v:string)=>headers.set(k,v),status:(value:number)=>{status=value;return response;},json:(data:unknown)=>new Response(JSON.stringify(data),{status,headers})};headers.set('Content-Type','application/json');return handler({method:'POST',headers:Object.fromEntries(req.headers),body:await req.text()},response);}

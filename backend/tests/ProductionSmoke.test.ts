import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import WebSocket from 'ws';
import { unpack } from 'msgpackr';

async function freePort():Promise<number>{
  const socket=net.createServer();
  socket.listen(0,'127.0.0.1');
  await once(socket,'listening');
  const address=socket.address();
  if(!address||typeof address==='string')throw new Error('Unable to allocate test port');
  const port=address.port;
  await new Promise<void>(resolve=>socket.close(()=>resolve()));
  return port;
}
function waitForLog(child:ChildProcess,pattern:RegExp,timeoutMs=15_000):Promise<RegExpMatchArray>{
  return new Promise((resolve,reject)=>{
    let output='';
    const timer=setTimeout(()=>{cleanup();reject(new Error('Backend startup timed out. Output: '+output));},timeoutMs);
    const onData=(chunk:Buffer)=>{output+=chunk.toString();const match=output.match(pattern);if(match){cleanup();resolve(match);}};
    const onExit=(code:number|null)=>{cleanup();reject(new Error('Backend exited before ready ('+code+'). Output: '+output));};
    const cleanup=()=>{clearTimeout(timer);child.stdout?.off('data',onData);child.stderr?.off('data',onData);child.off('exit',onExit);};
    child.stdout?.on('data',onData);child.stderr?.on('data',onData);child.once('exit',onExit);
  });
}

test('production server smoke: health, readiness, MessagePack WebSocket and graceful shutdown',async()=>{
  const directory=mkdtempSync(path.join(tmpdir(),'nexus-e2e-'));
  const port=await freePort();
  const child=spawn(process.execPath,[path.resolve(__dirname,'../server.js')],{
    cwd:path.resolve(__dirname,'../..'),
    env:{...process.env,PORT:String(port),CORE_DB_PATH:path.join(directory,'core.db'),RESEARCH_DB_PATH:path.join(directory,'research.db'),CORS_ORIGINS:'http://localhost:5173'},
    stdio:['ignore','pipe','pipe']
  });
  let socket:WebSocket|undefined;
  let childOutput='';
  child.stdout?.on('data',chunk=>{childOutput+=chunk.toString();});
  child.stderr?.on('data',chunk=>{childOutput+=chunk.toString();});
  try{
    await waitForLog(child,new RegExp('Server running on port '+port));
    const health=await fetch('http://127.0.0.1:'+port+'/health');
    assert.equal(health.status,200);
    assert.equal((await health.json() as {status:string}).status,'ok');
    const ready=await fetch('http://127.0.0.1:'+port+'/ready');
    assert.equal(ready.status,200);
    assert.equal((await ready.json() as {ready:boolean}).ready,true);

    socket=new WebSocket('ws://127.0.0.1:'+port);
    const [data]=await once(socket,'message') as [Buffer];
    const initial=unpack(data) as {type:string;data:{marketFeed:{marketType:string;source:string}}};
    assert.equal(initial.type,'INIT_STATE');
    assert.equal(initial.data.marketFeed.marketType,'LIVE');
    assert.equal(initial.data.marketFeed.source,'PROVIDER_API');
    socket.close();
    await once(socket,'close');
    await new Promise(resolve=>setTimeout(resolve,100));

    child.kill('SIGTERM');
    const [code,signal]=await once(child,'exit') as [number|null,NodeJS.Signals|null];
    assert.equal(signal,null);
    assert.equal(code,0,'Backend shutdown failed. Output: '+childOutput);
  }finally{
    if(socket&&socket.readyState!==WebSocket.CLOSED)socket.terminate();
    if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
    rmSync(directory,{recursive:true,force:true});
  }
});

import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {CallSession,CONNECT_TIMEOUT_MS,RECOVERY_TIMEOUT_MS,DISCONNECT_GRACE_MS} from '../src/callSession';
class Stream {getTracks(){return [];}getVideoTracks(){return [];}getAudioTracks(){return [];}}
class Peer {
 connectionState='new';iceConnectionState='new';iceGatheringState='new';signalingState='stable';remoteDescription:any=null;localDescription:any=null;
 onconnectionstatechange:any;oniceconnectionstatechange:any;onsignalingstatechange:any;onicecandidate:any;
 constructor(public config:any){}
 getConfiguration(){return this.config;}
 setRemoteDescription=vi.fn(async (d:any)=>{this.remoteDescription=d;});
 addIceCandidate=vi.fn(async (_c:any)=>{});
 getTransceivers(){return [];}
 addTransceiver(){return {direction:'sendrecv',sender:{setStreams(){},replaceTrack:async()=>{}},receiver:{track:{kind:'video'}}};}
 createOffer=vi.fn(async()=>({type:'offer',sdp:'a=ice-ufrag:local\r\n'}));
 createAnswer=vi.fn(async()=>({type:'answer',sdp:'a=ice-ufrag:local\r\n'}));
 setLocalDescription=vi.fn(async(d:any)=>{this.localDescription=d;});
 createDataChannel(){return channel();}
 getStats=vi.fn(async()=>new Map());
 close=vi.fn(()=>{this.connectionState='closed';});
}
function channel(){return {readyState:'open',close:vi.fn(),send:vi.fn(),onopen:null,onclose:null,onerror:null,onmessage:null};}
let call:any,pc:Peer;
beforeEach(async()=>{
 vi.useFakeTimers();vi.stubGlobal('MediaStream',Stream);vi.stubGlobal('RTCPeerConnection',Peer);vi.stubGlobal('WebSocket',{OPEN:1});
 call=new CallSession('room','Tester',{status:vi.fn(),local:vi.fn(),remote:vi.fn(),changed:vi.fn(),media:vi.fn()});
 call.socket={readyState:1,send:vi.fn(),close:vi.fn()};
 await call.handleSignal({type:'joined',self:{id:'self',name:'Tester'},config:{iceServers:[{urls:'turn:secret-host.test',username:'secret-user',credential:'secret-password'}]}});
 pc=call.pc;
});
afterEach(()=>{call.end();vi.useRealTimers();vi.unstubAllGlobals();});
const candidate=(ufrag='peer')=>({candidate:'candidate:1 1 udp 1 192.0.2.1 9999 typ host',sdpMid:'0',usernameFragment:ufrag});
const description=(ufrag='peer')=>({type:'signal',data:{description:{type:'offer',sdp:`a=ice-ufrag:${ufrag}\r\n`}}});
it('queues candidates and end marker until remote SDP, then answers; no secret diagnostic fields',async()=>{
 await call.handleSignal({type:'signal',data:{candidate:candidate()}});
 await call.handleSignal({type:'signal',data:{candidate:null}});
 expect(pc.addIceCandidate).not.toHaveBeenCalled();
 await call.handleSignal(description());
 expect(pc.addIceCandidate).toHaveBeenCalledTimes(2);expect(pc.createAnswer).toHaveBeenCalledOnce();
 expect(call.socket.send.mock.calls.some((v:any)=>JSON.parse(v[0]).data.description?.type==='answer')).toBe(true);
 expect(call.diagnostics.join('\n')).not.toMatch(/secret-host|secret-user|secret-password|192\.0\.2\.1|ice-ufrag/);
});
it('bad ICE does not abort SDP or the following valid candidate',async()=>{
 pc.addIceCandidate.mockRejectedValueOnce(new DOMException('secret-password candidate SDP','OperationError'));
 await call.handleSignal({type:'signal',data:{candidate:candidate()}});await call.handleSignal(description());
 await call.handleSignal({type:'signal',data:{candidate:candidate()}});
 expect(call.status).not.toBe('ended');expect(pc.createAnswer).toHaveBeenCalledOnce();expect(pc.addIceCandidate).toHaveBeenCalledTimes(2);
 expect(call.diagnostics.join('\n')).toContain('ICE отклонён: OperationError');expect(call.diagnostics.join('\n')).not.toContain('secret-password');
});
it('queues next-generation ICE and drops obsolete ICE after restart SDP',async()=>{
 await call.handleSignal(description());await call.handleSignal({type:'signal',data:{candidate:candidate('next')}});
 expect(pc.addIceCandidate).not.toHaveBeenCalled();
 await call.handleSignal(description('next'));expect(pc.addIceCandidate).toHaveBeenCalledOnce();
 await call.handleSignal({type:'signal',data:{candidate:candidate('peer')}});expect(pc.addIceCandidate).toHaveBeenCalledOnce();
});
async function ready(){await call.handleSignal({type:'ready',initiator:true,peer:{id:'p',name:'Peer'}});pc.connectionState='connected';pc.iceConnectionState='connected';call.connectionChanged();}
it('short ICE-only disconnected keeps tracks and channel, cancels recovery on reconnection',async()=>{
 await ready();pc.iceConnectionState='disconnected';pc.oniceconnectionstatechange();
 expect(call.status).toBe('reconnecting');await vi.advanceTimersByTimeAsync(DISCONNECT_GRACE_MS-1);expect(pc.createOffer).toHaveBeenCalledTimes(1);expect(pc.close).not.toHaveBeenCalled();
 pc.iceConnectionState='connected';pc.oniceconnectionstatechange();await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS+RECOVERY_TIMEOUT_MS);
 expect(call.status).toBe('connected');expect(pc.createOffer).toHaveBeenCalledTimes(1);
});
it('persistent disconnected restarts once; initial deadline cannot cut recovery short',async()=>{
 await call.handleSignal({type:'ready',initiator:true,peer:{id:'p',name:'Peer'}});
 await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS-1000);
 pc.connectionState='disconnected';pc.iceConnectionState='disconnected';pc.onconnectionstatechange();
 await vi.advanceTimersByTimeAsync(DISCONNECT_GRACE_MS+1);expect(pc.createOffer).toHaveBeenCalledTimes(2);expect(call.status).toBe('reconnecting');
 pc.oniceconnectionstatechange();await vi.advanceTimersByTimeAsync(RECOVERY_TIMEOUT_MS-DISCONNECT_GRACE_MS);expect(call.status).toBe('ended');
 expect(pc.close).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
});
it('failed defers restart while offer outstanding and retries after stable, only once',async()=>{
 await ready();pc.signalingState='have-local-offer';pc.iceConnectionState='failed';pc.oniceconnectionstatechange();
 expect(pc.createOffer).toHaveBeenCalledTimes(1);pc.signalingState='stable';pc.onsignalingstatechange();await call.serial;
 expect(pc.createOffer).toHaveBeenCalledTimes(2);pc.oniceconnectionstatechange();await call.serial;expect(pc.createOffer).toHaveBeenCalledTimes(2);
});
it('channel error gets grace, duplicate ready is ignored and end cancels pending restart',async()=>{
 await ready();await call.handleSignal({type:'ready',initiator:true,peer:{id:'p',name:'Peer'}});expect(pc.createOffer).toHaveBeenCalledTimes(1);
 call.channel.onerror();expect(call.status).toBe('reconnecting');expect(pc.close).not.toHaveBeenCalled();
 call.end();await vi.advanceTimersByTimeAsync(90000);expect(pc.createOffer).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
});
it('ending during pending createOffer never publishes late SDP or recreates timers',async()=>{
 let resolve:any;pc.createOffer.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
 const promise=call.handleSignal({type:'ready',initiator:true,peer:{id:'p',name:'Peer'}});
 await vi.advanceTimersByTimeAsync(0);call.end();resolve({type:'offer',sdp:'late'});await promise;
 expect(pc.setLocalDescription).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
});

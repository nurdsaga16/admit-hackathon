import { Conversation, parseCaption, type CaptionPacket, type Participant, type MessageKind } from './conversation';
export const CONNECT_TIMEOUT_MS = 60000, RECOVERY_TIMEOUT_MS = 30000, DISCONNECT_GRACE_MS = 5000;
export type CallStatus = 'preparing' | 'waiting' | 'connecting' | 'connected' | 'reconnecting' | 'ended';
export type CallEvents = {
  status: (status: CallStatus, detail: string) => void;
  local: (stream: MediaStream) => void;
  remote: (stream: MediaStream) => void;
  changed: () => void;
  media: () => void;
};
export class CallSession {
  readonly conversation = new Conversation();
  readonly localStream = new MediaStream();
  readonly remoteStream = new MediaStream();
  self: Participant = { id: '', name: '' };
  peer: Participant | null = null;
  pc: RTCPeerConnection | null = null;
  channel: RTCDataChannel | null = null;
  socket: WebSocket | null = null;
  status: CallStatus = 'preparing';
  private closed = false;
  private initiator = false;
  private candidates: (RTCIceCandidateInit | null)[] = [];
  private retiredUfrags = new Set<string>();
  readonly diagnostics: string[] = [];
  private statsTimer?: ReturnType<typeof setInterval>;
  private restartDelay?: ReturnType<typeof setTimeout>;
  private restartPending = false;
  private ready = false;
  private turnConfigured = false;
  private lastTransport = "";
  private serial = Promise.resolve();
  private videoSender?: RTCRtpSender;
  private audioSender?: RTCRtpSender;
  private deadline?: ReturnType<typeof setTimeout>;
  private recovery?: ReturnType<typeof setTimeout>;
  private restarted = false;
  private mediaBusy = false;
  constructor(readonly roomId: string, readonly name: string, readonly events: CallEvents) {}
  get cameraOn() { return this.localStream.getVideoTracks().some(t => t.readyState === 'live'); }
  get microphoneOn() { return this.localStream.getAudioTracks().some(t => t.readyState === 'live'); }
  get canSend() { return !this.closed && this.status === 'connected' && this.channel?.readyState === 'open'; }
  private diagnostic(message: string) {
    // Only authored messages/enums/counters. Never SDP, candidates, URLs, credentials or raw errors.
    this.diagnostics.push(`${new Date().toISOString().slice(11,23)} ${message}`);
    if (this.diagnostics.length > 120) this.diagnostics.shift();
    this.events.changed();
  }
  private errorName(error: unknown) {
    const name = error instanceof Error ? error.name : '';
    return ['OperationError','InvalidStateError','InvalidAccessError','NotSupportedError','TypeError','SyntaxError'].includes(name) ? name : 'Error';
  }
  private transportHint() { return this.turnConfigured ? 'TURN настроен: проверь доступность и срок credentials, затем создай новую комнату.' : 'TURN не настроен: эта сеть может требовать внешний TURN. Одного HTTPS-туннеля недостаточно.'; }
  private async inspectTransport() {
    const pc = this.pc;
    if (!pc || this.closed) return;
    try {
      const stats = await pc.getStats();
      if (this.closed) return;
      const transport = [...stats.values()].find(x => x.type === 'transport' && x.selectedCandidatePairId);
      const pair = transport && stats.get(transport.selectedCandidatePairId);
      if (!pair) return;
      const local = stats.get(pair.localCandidateId), remote = stats.get(pair.remoteCandidateId);
      const type = (v: unknown) => ['host','srflx','prflx','relay'].includes(String(v)) ? String(v) : '?';
      const protocol = local?.protocol === 'tcp' ? 'tcp' : local?.protocol === 'udp' ? 'udp' : '?';
      const summary = `Выбранный путь: ${type(local?.candidateType)} → ${type(remote?.candidateType)}, ${protocol}`;
      if (summary !== this.lastTransport) { this.lastTransport = summary; this.diagnostic(summary); }
    } catch { /* A closed transport may have no stats. */ }
  }
  private state(status: CallStatus, detail: string) { this.status = status; this.events.status(status, detail); }
  private signal(data: unknown) {
    if (this.socket?.readyState !== WebSocket.OPEN) throw new Error('Сервер сигналинга недоступен.');
    this.socket.send(JSON.stringify({ type: 'signal', data }));
  }
  async start() {
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Для камеры нужен HTTPS или localhost.');
      this.state('preparing', 'Разреши доступ к камере. Микрофон включается отдельно.');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false });
      if (this.closed) { stream.getTracks().forEach(t => t.stop()); return; }
      stream.getTracks().forEach(t => this.addLocalTrack(t));
      this.events.local(this.localStream);
      const url = new URL('/signal', location.href); url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      this.socket = new WebSocket(url);
      this.deadline = setTimeout(() => this.end('Сервер не ответил. Проверь запуск сервера и соединение.'), 15000);
      this.socket.onopen = () => { if(this.closed)return; this.diagnostic('WebSocket открыт; ожидается joined'); this.socket?.send(JSON.stringify({ type: 'join', roomId: this.roomId, name: this.name })); };
      this.socket.onmessage = event => {
        this.serial = this.serial.then(async () => { if (!this.closed) await this.handleSignal(JSON.parse(event.data)); })
          .catch(error => { if(this.closed)return; this.diagnostic(`Ошибка SDP/сигналинга: ${this.errorName(error)}`); this.end('Не удалось согласовать SDP. Открой диагностику соединения и передай журнал разработчику.'); });
      };
      this.socket.onerror = () => { if(!this.closed)this.diagnostic('Ошибка WebSocket: ожидаем close или тайм-аут'); };
      this.socket.onclose = event => { if (!this.closed) { this.diagnostic(`WebSocket закрыт: код ${event.code}, штатно ${event.wasClean ? 'да' : 'нет'}`); this.end('Связь с сервером сигналинга потеряна. Создай новую комнату для повторного звонка.'); } };
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      this.end(name === 'NotAllowedError' ? 'Доступ к камере закрыт. Разреши камеру в настройках сайта и попробуй снова.'
        : name === 'NotFoundError' ? 'Камера не найдена. Подключи камеру и попробуй снова.'
        : name === 'NotReadableError' ? 'Камера занята. Закрой другие приложения с камерой.'
        : error instanceof Error ? error.message : 'Не удалось включить камеру.');
    }
  }
  private addLocalTrack(track: MediaStreamTrack) {
    this.localStream.addTrack(track);
    track.onended = () => { this.localStream.removeTrack(track); this.events.media(); };
    this.events.media();
  }
  private async handleSignal(message: any) {
    if (message.type === 'error' || message.type === 'ended') { this.diagnostic(message.type === 'error' ? 'Сервер отклонил запрос' : 'Сервер завершил комнату'); this.end(message.message ?? message.reason, false); return; }
    if (message.type === 'joined') {
      if (this.pc) { this.diagnostic('Повторный joined пропущен'); return; }
      clearTimeout(this.deadline); this.self = message.self;
      this.pc = new RTCPeerConnection(message.config);
      const config = this.pc.getConfiguration();
      const urls = (config.iceServers ?? []).flatMap(server => typeof server.urls === 'string' ? [server.urls] : server.urls);
      const stun = urls.filter(url => /^stuns?:/i.test(url)).length, turn = urls.filter(url => /^turns?:/i.test(url)).length;
      this.turnConfigured = turn > 0;
      this.diagnostic(`ICE config от сервера: STUN ${stun}, TURN ${turn}, policy ${config.iceTransportPolicy ?? 'all'}`);
      if (!turn) this.diagnostic('TURN отсутствует; связь между разными сетями не гарантирована');
      this.pc.onicecandidateerror = event => { if (!this.closed) this.diagnostic(`Ошибка STUN/TURN: код ${event.errorCode}. Один адрес может быть недоступен; продолжаем ICE.`); };
      this.pc.onicegatheringstatechange = () => { if(!this.closed)this.diagnostic(`Сбор ICE: ${this.pc!.iceGatheringState}`); };
      this.pc.onsignalingstatechange = () => { if(this.closed)return; this.diagnostic(`SDP state: ${this.pc!.signalingState}`); if(this.pc!.signalingState === 'stable' && this.restartPending)this.restartIce(); };
      this.pc.oniceconnectionstatechange = () => this.connectionChanged();
      this.statsTimer = setInterval(() => void this.inspectTransport(), 2000);
      this.pc.onicecandidate = event => {
        if (!this.closed) {
          try { if(event.candidate) { this.signal({ candidate: event.candidate.toJSON() }); this.diagnostic(`ICE отправлен: ${event.candidate.type ?? 'конец поколения'}`); } }
          catch { this.end('Связь с сервером потеряна. Создай новую комнату.'); }
        }
      };
      this.pc.ontrack = event => {
        const attach = () => {
          if (this.closed) return;
          if (!this.remoteStream.getTracks().some(t => t.id === event.track.id)) this.remoteStream.addTrack(event.track);
          this.events.remote(this.remoteStream);
        };
        // A reserved audio transceiver has no packets until the microphone is enabled.
        // Do not let that initially muted track delay playback of the remote video.
        event.track.onunmute = attach;
        if (!event.track.muted) attach();
      };
      this.pc.ondatachannel = event => this.attachChannel(event.channel);
      this.pc.onconnectionstatechange = () => this.connectionChanged();
      this.state('waiting', 'Ожидание собеседника. Отправь ему ссылку комнаты.');
      this.events.changed();
    } else if (message.type === 'ready') {
      if(this.ready || !this.pc) { this.diagnostic('Повторный/ранний ready пропущен'); return; }
      this.ready = true; this.peer = message.peer; this.initiator = message.initiator;
      this.diagnostic(`Второй участник готов; роль ${this.initiator ? 'offerer' : 'answerer'}`);
      this.state('connecting', 'Соединяем видео и звук…'); this.events.changed();
      clearTimeout(this.deadline);
      this.deadline = setTimeout(() => { this.diagnostic('Тайм-аут подключения 60 с'); this.end(`WebRTC не установил соединение. ${this.transportHint()}`); }, CONNECT_TIMEOUT_MS);
      if (this.initiator) { this.attachChannel(this.pc!.createDataChannel('captions', { ordered: true })); await this.offer(); }
    } else if (message.type === 'signal' && this.pc) {
      const { description, candidate } = message.data;
      if (description) {
        this.diagnostic(`SDP получен: ${description.type === 'offer' ? 'offer' : 'answer'}`);
        const previous = this.remoteUfrags();
        await this.pc.setRemoteDescription(description);
        if(this.closed)return;
        for(const ufrag of previous) if(!this.remoteUfrags().has(ufrag))this.retiredUfrags.add(ufrag);
        this.diagnostic('RemoteDescription установлен');
        for (const item of this.candidates.splice(0)) await this.acceptCandidate(item);
        if (description.type === 'offer') {
          await this.bindTracks();
          if(this.closed)return;
          const answer = await this.pc.createAnswer();
          if(this.closed)return;
          await this.pc.setLocalDescription(answer);
          if(this.closed)return;
          this.signal({ description: this.pc.localDescription });
          this.diagnostic('SDP answer отправлен');
        }
      } else if (Object.hasOwn(message.data, 'candidate')) {
        await this.acceptCandidate(candidate);
      }
    }
  }
  private remoteUfrags() { return new Set([...((this.pc?.remoteDescription?.sdp ?? '').matchAll(/^a=ice-ufrag:(.+)$/gm))].map(m => m[1].trim())); }
  private async acceptCandidate(candidate: RTCIceCandidateInit | null) {
    if(this.closed || !this.pc)return;
    const ufrag = candidate?.usernameFragment;
    if(ufrag && this.retiredUfrags.has(ufrag)) { this.diagnostic('ICE старого поколения пропущен'); return; }
    if(!this.pc.remoteDescription || (ufrag && !this.remoteUfrags().has(ufrag))) {
      if(this.candidates.length < 128) { this.candidates.push(candidate); this.diagnostic(`ICE ожидает SDP: очередь ${this.candidates.length}`); }
      else this.diagnostic('Очередь ICE заполнена; кандидат пропущен');
      return;
    }
    try { await this.pc.addIceCandidate(candidate ?? undefined); if(!this.closed)this.diagnostic('ICE принят'); }
    catch(error) { if(!this.closed)this.diagnostic(`ICE отклонён: ${this.errorName(error)}. Проверяем остальные кандидаты.`); }
  }
  private async offer(restart = false) {
    if (this.closed || !this.pc) return;
    await this.bindTracks();
    if(this.closed)return;
    const offer = await this.pc.createOffer({ iceRestart: restart });
    if(this.closed)return;
    await this.pc.setLocalDescription(offer);
    if (!this.closed) { this.signal({ description: this.pc.localDescription }); this.diagnostic(restart ? 'SDP offer отправлен: ICE restart' : 'SDP offer отправлен'); }
  }
  private async bindTracks() {
    if (!this.pc || this.closed) return;
    // The answerer must bind the transceivers created by the remote offer.
    // Precreating addTransceiver() on both peers can leave answer tracks unassociated.
    for (const kind of ['video', 'audio'] as const) {
      if (this.closed) return;
      const transceiver = this.pc.getTransceivers().find(t => t.receiver.track.kind === kind)
        ?? this.pc.addTransceiver(kind, { direction: 'sendrecv' });
      transceiver.direction = 'sendrecv';
      transceiver.sender.setStreams(this.localStream);
      const track = this.localStream.getTracks().find(t => t.kind === kind && t.readyState === 'live') ?? null;
      await transceiver.sender.replaceTrack(track);
      if (kind === 'video') this.videoSender = transceiver.sender; else this.audioSender = transceiver.sender;
    }
  }
  private connectionChanged() {
    if (this.closed || !this.pc) return;
    const pc = this.pc;
    this.diagnostic(`WebRTC ${pc.connectionState}; ICE ${pc.iceConnectionState}; канал ${this.channel?.readyState ?? 'нет'}`);
    const iceHealthy = ['connected','completed'].includes(pc.iceConnectionState);
    if (pc.connectionState === 'connected' && iceHealthy && this.channel?.readyState === 'open') {
      clearTimeout(this.deadline); clearTimeout(this.recovery); clearTimeout(this.restartDelay);
      this.recovery = this.restartDelay = undefined; this.restarted = this.restartPending = false;
      this.state('connected', 'Соединение установлено');
      void this.inspectTransport();
    } else if ([pc.connectionState, pc.iceConnectionState].some(value => ['disconnected','failed'].includes(value))) {
      this.beginRecovery();
      if(pc.connectionState === 'failed' || pc.iceConnectionState === 'failed')this.restartIce();
    }
  }
  private beginRecovery() {
    if(this.closed)return;
    this.conversation.interim.clear(); this.events.changed();
    this.state('reconnecting', 'Связь прервалась. Пытаемся восстановить соединение…');
    if(this.recovery)return;
    clearTimeout(this.deadline); // Initial deadline must not cut an in-progress recovery short.
    this.diagnostic('Восстановление: до 30 с, без остановки камеры');
    this.recovery = setTimeout(() => { this.diagnostic('Тайм-аут восстановления 30 с'); this.end(`Соединение потеряно. ${this.transportHint()}`); }, RECOVERY_TIMEOUT_MS);
    this.restartDelay = setTimeout(() => this.restartIce(), DISCONNECT_GRACE_MS);
  }
  private restartIce() {
    if(this.closed || !this.initiator || this.restarted || !this.recovery || !this.pc)return;
    if(this.pc.signalingState !== 'stable') { this.restartPending = true; return; }
    this.restartPending = false; this.restarted = true;
    this.serial = this.serial.then(async () => {
      if(this.closed || !this.recovery)return;
      if(this.channel?.readyState === 'closed') { this.channel = null; this.attachChannel(this.pc!.createDataChannel('captions',{ordered:true})); }
      await this.offer(true);
    }).catch(error => { if(!this.closed)this.diagnostic(`ICE restart не выполнен: ${this.errorName(error)}`); });
  }
  private attachChannel(channel: RTCDataChannel) {
    if (this.closed) { channel.close(); return; }
    if (this.channel && this.channel.readyState !== 'closed' && this.channel !== channel) { channel.close(); return; }
    this.channel = channel;
    channel.onopen = () => this.connectionChanged();
    channel.onclose = () => { if (!this.closed && this.channel === channel) { this.diagnostic('Канал сообщений закрыт; ожидаем восстановление'); this.beginRecovery(); } };
    channel.onerror = () => { if (!this.closed && this.channel === channel) { this.diagnostic('Ошибка канала сообщений; ожидаем состояние транспорта'); this.beginRecovery(); } };
    channel.onmessage = event => {
      if (typeof event.data !== 'string' || event.data.length > 10000 || !this.peer) return;
      let value;
      try { value = JSON.parse(event.data); } catch { return; }
      if (!value || typeof value !== 'object') return;
      if (value.type === 'ack' && typeof value.id === 'string') { this.conversation.acknowledge(value.id); this.events.changed(); return; }
      const packet = parseCaption(value);
      if (!packet) return;
      this.conversation.receive(packet, this.peer, false);
      if (packet.final && channel.readyState === 'open') channel.send(JSON.stringify({ type: 'ack', id: packet.id }));
      this.events.changed();
    };
  }
  send(kind: MessageKind, text: string, final = true, id: string = crypto.randomUUID()): boolean {
    if (!this.canSend || text.length > 2000 || this.channel!.bufferedAmount > 128000) return false;
    const packet: CaptionPacket = { type: 'caption', id, kind, text, final };
    try { this.channel!.send(JSON.stringify(packet)); } catch { return false; }
    this.conversation.receive(packet, this.self, true); this.events.changed(); return true;
  }
  async toggleMedia(kind: 'audio' | 'video') {
    if (this.closed || this.mediaBusy) return;
    this.mediaBusy = true;
    const sender = kind === 'audio' ? this.audioSender : this.videoSender;
    const tracks = kind === 'audio' ? this.localStream.getAudioTracks() : this.localStream.getVideoTracks();
    try {
      if (tracks.length) {
        await sender?.replaceTrack(null);
        tracks.forEach(t => { t.stop(); this.localStream.removeTrack(t); });
      } else {
        const stream = await navigator.mediaDevices.getUserMedia(kind === 'audio'
          ? { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }
          : { video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false });
        if (this.closed) { stream.getTracks().forEach(t => t.stop()); return; }
        const track = stream.getTracks()[0];
        try { await sender?.replaceTrack(track); this.addLocalTrack(track); } catch (e) { track.stop(); throw e; }
      }
      this.events.local(this.localStream); this.events.media();
    } finally { this.mediaBusy = false; }
  }
  end(reason = 'Ты завершил звонок.', notify = true) {
    if (this.closed) return;
    this.diagnostic('Освобождение ресурсов звонка');
    this.closed = true; clearTimeout(this.deadline); clearTimeout(this.recovery); clearTimeout(this.restartDelay); clearInterval(this.statsTimer);
    this.restartPending = false; this.candidates = []; this.retiredUfrags.clear();
    if (notify && this.socket?.readyState === WebSocket.OPEN) { try { this.socket.send(JSON.stringify({ type: 'leave' })); } catch { /* Cleanup still runs when signaling is gone. */ } }
    this.channel?.close(); this.pc?.close(); this.socket?.close();
    this.localStream.getTracks().forEach(t => t.stop()); this.remoteStream.getTracks().forEach(t => t.stop());
    this.conversation.end(); this.state('ended', reason); this.events.changed(); this.events.media();
  }
}

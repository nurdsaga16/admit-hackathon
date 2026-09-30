import { Conversation, parseCaption, type CaptionPacket, type Participant, type MessageKind } from './conversation';
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
  private candidates: RTCIceCandidateInit[] = [];
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
      this.socket.onopen = () => this.socket?.send(JSON.stringify({ type: 'join', roomId: this.roomId, name: this.name }));
      this.socket.onmessage = event => {
        this.serial = this.serial.then(async () => { if (!this.closed) await this.handleSignal(JSON.parse(event.data)); })
          .catch(error => { console.error(error); this.end('Не удалось согласовать соединение. Создай новую комнату.'); });
      };
      this.socket.onerror = () => this.end('Сервер сигналинга недоступен. Проверь адрес и запуск сервера.');
      this.socket.onclose = () => { if (!this.closed) this.end('Связь с сервером потеряна. Создай новую комнату для повторного звонка.'); };
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
    if (message.type === 'error' || message.type === 'ended') { this.end(message.message ?? message.reason, false); return; }
    if (message.type === 'joined') {
      clearTimeout(this.deadline); this.self = message.self;
      this.pc = new RTCPeerConnection(message.config);
      this.pc.onicecandidate = event => {
        if (!this.closed) {
          try { this.signal({ candidate: event.candidate?.toJSON() ?? null }); }
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
      this.peer = message.peer; this.initiator = message.initiator;
      this.state('connecting', 'Соединяем видео и звук…'); this.events.changed();
      this.deadline = setTimeout(() => this.end('Соединение не установлено. Для этой сети может потребоваться TURN. Попробуй другую сеть или проверь настройки сервера.'), 30000);
      if (this.initiator) { this.attachChannel(this.pc!.createDataChannel('captions', { ordered: true })); await this.offer(); }
    } else if (message.type === 'signal' && this.pc) {
      const { description, candidate } = message.data;
      if (description) {
        await this.pc.setRemoteDescription(description);
        for (const item of this.candidates.splice(0)) await this.pc.addIceCandidate(item);
        if (description.type === 'offer') {
          await this.bindTracks();
          await this.pc.setLocalDescription(await this.pc.createAnswer());
          this.signal({ description: this.pc.localDescription });
        }
      } else if (candidate) {
        if (this.pc.remoteDescription) await this.pc.addIceCandidate(candidate); else this.candidates.push(candidate);
      }
    }
  }
  private async offer(restart = false) {
    if (this.closed || !this.pc) return;
    await this.bindTracks();
    await this.pc.setLocalDescription(await this.pc.createOffer({ iceRestart: restart }));
    if (!this.closed) this.signal({ description: this.pc.localDescription });
  }
  private async bindTracks() {
    if (!this.pc || this.closed) return;
    // The answerer must bind the transceivers created by the remote offer.
    // Precreating addTransceiver() on both peers can leave answer tracks unassociated.
    for (const kind of ['video', 'audio'] as const) {
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
    if (this.pc.connectionState === 'connected' && this.channel?.readyState === 'open') {
      clearTimeout(this.deadline); clearTimeout(this.recovery); this.recovery = undefined; this.restarted = false;
      this.state('connected', 'Соединение установлено');
    } else if (['disconnected', 'failed'].includes(this.pc.connectionState)) {
      this.conversation.interim.clear(); this.events.changed();
      this.state('reconnecting', 'Связь прервалась. Пытаемся восстановить соединение…');
      if (!this.recovery) this.recovery = setTimeout(() => this.end('Соединение потеряно. История сохранена в этой вкладке. Создай новую комнату.'), 20000);
      if (this.initiator && !this.restarted) {
        this.restarted = true;
        this.serial = this.serial.then(() => this.offer(true)).catch(() => this.end('Не удалось восстановить соединение.'));
      }
    }
  }
  private attachChannel(channel: RTCDataChannel) {
    if (this.channel && this.channel !== channel) { channel.close(); return; }
    this.channel = channel;
    channel.onopen = () => this.connectionChanged();
    channel.onclose = () => { if (!this.closed) this.end('Канал сообщений закрыт. Звонок завершён.'); };
    channel.onerror = () => { if (!this.closed) this.end('Ошибка канала сообщений. Звонок завершён.'); };
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
    this.closed = true; clearTimeout(this.deadline); clearTimeout(this.recovery);
    if (notify && this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'leave' }));
    this.channel?.close(); this.pc?.close(); this.socket?.close();
    this.localStream.getTracks().forEach(t => t.stop()); this.remoteStream.getTracks().forEach(t => t.stop());
    this.conversation.end(); this.state('ended', reason); this.events.changed(); this.events.media();
  }
}

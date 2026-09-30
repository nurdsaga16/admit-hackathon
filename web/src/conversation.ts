export type Participant = { id: string; name: string };
export type MessageKind = 'gesture' | 'speech' | 'text';
export type CaptionPacket = { type: 'caption'; id: string; kind: MessageKind; text: string; final: boolean };
export type Entry = CaptionPacket & { sender: Participant; local: boolean; time: number; delivery: 'pending' | 'delivered' | 'unconfirmed' };
export class Conversation {
  entries: Entry[] = [];
  interim = new Map<string, Entry>();
  private completed = new Set<string>();
  receive(packet: CaptionPacket, sender: Participant, local: boolean): boolean {
    const key = `${sender.id}:${packet.id}`;
    if (this.completed.has(key)) return false;
    const entry: Entry = { ...packet, sender, local, time: Date.now(), delivery: local ? 'pending' : 'delivered' };
    if (packet.final) {
      this.completed.add(key); this.interim.delete(sender.id);
      if (packet.text.trim()) this.entries.push(entry);
    } else if (packet.text.trim()) this.interim.set(sender.id, entry);
    else this.interim.delete(sender.id);
    return true;
  }
  acknowledge(id: string) { const e = this.entries.find(e => e.local && e.id === id); if (e) e.delivery = 'delivered'; }
  end() { this.interim.clear(); this.entries.forEach(e => { if (e.delivery === 'pending') e.delivery = 'unconfirmed'; }); }
}
export function parseCaption(value: unknown): CaptionPacket | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as CaptionPacket;
  if (p.type !== 'caption' || typeof p.id !== 'string' || p.id.length > 100 || !p.id || !['gesture', 'speech', 'text'].includes(p.kind) || typeof p.text !== 'string' || p.text.length > 2000 || typeof p.final !== 'boolean') return null;
  return p;
}

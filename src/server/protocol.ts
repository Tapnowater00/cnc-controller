// Wire format shared between Pi server and web client.

export interface ReqMessage {
  type: 'req'
  id: string
  method: string
  args: unknown[]
}

export type ResMessage =
  | { type: 'res'; id: string; ok: true; data: unknown }
  | { type: 'res'; id: string; ok: false; error: string }

export interface EvtMessage {
  type: 'evt'
  channel: string
  payload: unknown
}

export type ServerMessage = ResMessage | EvtMessage
export type ClientMessage = ReqMessage

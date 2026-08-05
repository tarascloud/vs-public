export interface TelegramMessage {
  message_id: number
  from: {
    id: number
    username?: string
    first_name?: string
    last_name?: string
    language_code?: string
  }
  chat: {
    id: number
    type: string
  }
  text?: string
  voice?: {
    file_id: string
    file_unique_id: string
    duration: number
    mime_type?: string
    file_size?: number
  }
  document?: {
    file_id: string
    file_unique_id: string
    file_name?: string
    mime_type?: string
    file_size?: number
  }
  photo?: Array<{
    file_id: string
    file_unique_id: string
    width: number
    height: number
    file_size?: number
  }>
  caption?: string
  reply_to_message?: {
    message_id: number
    text?: string
  }
}

export interface TelegramCallbackQuery {
  id: string
  from: {
    id: number
    username?: string
    first_name?: string
    language_code?: string
  }
  message?: {
    message_id: number
    chat: { id: number }
  }
  data?: string
}

export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  callback_query?: TelegramCallbackQuery
}

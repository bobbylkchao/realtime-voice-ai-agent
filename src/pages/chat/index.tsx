import React from 'react'
import { BotContainer } from './styled'
import { HeaderH2 } from '../../component/header/styled'
import ChatBot from '../../component/chat-bot'

const ChatPage = (): React.ReactElement => {
  return (
    <BotContainer>
      <HeaderH2>Realtime Voice AI Agent (Demo)</HeaderH2>
      <ChatBot />
    </BotContainer>
  )
}

export default ChatPage

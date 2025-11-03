import React from 'react'
import { Typography } from 'antd'
import { GithubOutlined } from '@ant-design/icons'
import { BotContainer } from './styled'
import { HeaderH2 } from '../../component/header/styled'
import ChatBot from '../../component/chat-bot'

const ChatPage = (): React.ReactElement => {
  const { Link } = Typography
  return (
    <BotContainer>
      <HeaderH2>Realtime Voice AI Agent (Demo)</HeaderH2>
      <Link
        href='https://github.com/bobbylkchao/realtime-voice-ai-agent'
        target='_blank'
      ><GithubOutlined /> Check on GitHub</Link>
      <ChatBot />
    </BotContainer>
  )
}

export default ChatPage

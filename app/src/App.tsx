import { BrowserRouter as Router, Route, Routes } from 'react-router-dom'
import { ApolloProvider } from '@apollo/client'
import { Toaster } from 'react-hot-toast'
import { apolloClient } from './service/apollo'
import { Wrapper } from './component/wrapper/styled'
import ChatPage from './pages/chat'
import NotFoundPage from './pages/not-found'

function App() {
  return (
    <Wrapper>
      <ApolloProvider client={apolloClient}>
        <Router>
          <Routes>
            <Route path="/" element={<ChatPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Router>
      </ApolloProvider>
      <Toaster />
    </Wrapper>
  )
}

export default App

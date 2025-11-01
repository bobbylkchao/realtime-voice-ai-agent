import { BrowserRouter as Router, Route, Routes } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { Wrapper } from './component/wrapper/styled'
import ChatPage from './pages/chat'
import NotFoundPage from './pages/not-found'

function App() {
  return (
    <Wrapper>
      <Router>
        <Routes>
          <Route path="/" element={<ChatPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Router>
      <Toaster />
    </Wrapper>
  )
}

export default App

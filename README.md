# Realtime Voice AI Agent Starter Kit

A starter kit and template for building realtime voice AI agents using OpenAI's Realtime API. This project provides a production-ready foundation with the latest OpenAI SDK capabilities, enabling developers to quickly start building their own voice AI applications.

## 🎯 Purpose

This starter kit is designed to help developers quickly get started with OpenAI's Realtime API by providing:

- **Complete Implementation**: Pre-configured frontend and backend with all necessary integrations
- **Latest OpenAI SDK Features**: Integrated with the newest OpenAI SDK capabilities
- **Production-Ready Patterns**: Best practices for multi-agent systems, session management, and MCP integration
- **Example Implementations**: Demo agents and MCP servers as reference for customization

**Note**: The included hotel booking agent, flight booking agent, car rental agent, and MCP servers (booking MCP, post-booking MCP) are demo examples only. Replace them with your own agents and MCP servers to build your custom application.

## ✨ Key Features

- **Realtime Voice Interaction**: Bi-directional audio streaming with OpenAI's Realtime API
- **Multi-Agent Handoff**: Intelligent routing and handoff between specialized agents
- **Agent-to-Agent Communication**: Agents can delegate tasks to other specialized agents
- **Multiple MCP Servers**: Integration with multiple Model Context Protocol (MCP) servers for tool access
- **Multiple Sessions**: Concurrent handling of multiple user sessions with proper isolation
- **Voice Activity Detection**: Server-side VAD for natural conversation flow

## 🎬 Demo Video

Watch the demo video to see the following features in action:

1. **Backend VAD Detection**: Server-side voice activity detection
2. **Multi-Agents & Agent-to-Agent (A2A)**: Agent handoff and communication
3. **MCP Server Integration**: Tool discovery and function calling
4. **User Interruption**: Interrupting AI output in real-time
5. **Tool Function Calls**: External API integration (success and failure scenarios)

[![IMAGE ALT TEXT HERE](https://img.youtube.com/vi/ayLRnQDA7RE/0.jpg)](https://www.youtube.com/watch?v=ayLRnQDA7RE)

[https://www.youtube.com/watch?v=ayLRnQDA7RE](https://www.youtube.com/watch?v=ayLRnQDA7RE)

## Tech Stack

### Frontend
- React 19
- TypeScript
- Vite
- Socket.IO Client

### Backend
- Node.js (>= 16.0.0)
- Express
- TypeScript
- Socket.IO
- OpenAI Realtime API
- Model Context Protocol (MCP)

## Getting Started

### Prerequisites

- Node.js >= 16.0.0
- npm or yarn
- OpenAI API Key

### Frontend Setup

1. **Install Dependencies**

```sh
npm install
```

2. **Start Frontend Application**

```sh
npm run start
```

3. **Access the Frontend**

Visit the app at: http://localhost:3000

The frontend will automatically connect to the backend WebSocket server at `ws://localhost:4000/realtime-voice` once it's running.

### Backend Setup

1. **Install Dependencies**

```sh
cd backend
npm install
```

2. **Configure Environment Variables**

Create a `.env` file in the `backend` directory:

```sh
cd backend
cp .env.example .env  # If you have an example file, or create .env manually
```

Add the following configuration to `.env`:

```env
# OpenAI API Configuration
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_VOICE_MODEL=gpt-realtime

# Server Port (optional, defaults to 4000)
PORT=4000
```

3. **Start Backend Application**

```sh
npm run dev
```

The backend will start on http://localhost:4000 (or the port specified in `PORT` environment variable).

### Running Both Services

1. Open a terminal and start the backend:
```sh
cd backend
npm run dev
```

2. Open another terminal and start the frontend:
```sh
npm run start
```

3. Access the application at http://localhost:3000

## Available Scripts

### Frontend Scripts

- `npm run start` - Start development server
- `npm run build` - Build for production
- `npm run test` - Run tests
- `npm run lint` - Run ESLint

### Backend Scripts

- `npm run dev` - Start development server with nodemon
- `npm run start` - Compile and start production server
- `npm run build` - Compile TypeScript to JavaScript
- `npm run lint` - Run ESLint

## Architecture

The system consists of:

1. **Frontend**: React application that handles audio capture, playback, and WebSocket communication
2. **Backend**: Express server with Socket.IO for WebSocket connections
3. **OpenAI Realtime API**: Handles voice-to-voice AI interactions
4. **MCP Servers**: Provide tools and capabilities to AI agents

For detailed architecture documentation, see:
- [Backend Architecture](./doc/backend-voice-ai-agent-design.md)
- [Frontend Audio Processing](./doc/frontend-audio-process.md)

## Customization

### Adding Your Own Agents

Replace or extend the demo agents in `backend/src/service/open-ai/agents/`:

- `front-desk-agent/` - Main routing agent (example implementation)
- `hotel-booking-agent/` - Hotel booking agent (demo)
- `flight-booking-agent/` - Flight booking agent (demo)
- `car-rental-booking-agent/` - Car rental agent (demo)
- `post-booking-agent/` - Post-booking agent (demo)

### Adding Your Own MCP Servers

Create new MCP servers in `backend/src/service/mcp-server/` and register them in `backend/src/service/mcp-server/index.ts`. The included MCP servers are examples:

- `booking-mcp-server/` - Booking tools (demo)
- `post-booking-mcp-server/` - Post-booking tools (demo)

### Key Implementation Points

1. **Agent Handoff**: Implement handoff logic in your agents using the OpenAI SDK's handoff capabilities
2. **MCP Integration**: Register MCP servers and connect them to agents that need tool access
3. **Session Management**: Each client connection creates a new voice session with proper lifecycle management
4. **Audio Processing**: Frontend handles audio chunk concatenation and sample rate conversion automatically

## Project Structure

```
realtime-voice-ai-agent/
├── src/                          # Frontend source code
│   └── component/               # React components
│   └── service/                 # Frontend services (WebSocket, etc.)
├── backend/                      # Backend source code
│   └── src/
│       └── service/
│           ├── open-ai/         # OpenAI integration
│           │   └── agents/     # AI agents (replace with your own)
│           ├── mcp-server/     # MCP servers (replace with your own)
│           └── websocket/      # WebSocket handlers
├── doc/                          # Architecture documentation
└── build/                        # Frontend build output
```

## License

MIT

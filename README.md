# Realtime Voice AI Agent Starter Kit

A starter kit and template for building realtime voice AI agents using OpenAI's Realtime API. This project enables your AI agent to handle voice conversations in two ways: **users can talk through their web browser**, or **your AI can answer phone calls directly**. Built with production-ready patterns, it includes everything you need to create voice AI applications that work both on the web and over the phone.

## 🎯 Purpose

This starter kit is designed to help developers quickly get started with OpenAI's Realtime API by providing:

- **Complete Implementation**: Pre-configured frontend and backend with all necessary integrations
- **Latest OpenAI SDK Features**: Integrated with the newest OpenAI SDK capabilities
- **Production-Ready Patterns**: Best practices for multi-agent systems, session management, and MCP integration
- **Phone Agent Support**: Built-in Twilio integration for phone-based voice AI interactions
- **Example Implementations**: Demo agents and MCP servers as reference for customization

**Note**: The included hotel booking agent, flight booking agent, car rental agent, and MCP servers (booking MCP, post-booking MCP) are demo examples only. Replace them with your own agents and MCP servers to build your custom application.

## ✨ Key Features

- **Realtime Voice Interaction**: Bi-directional audio streaming with OpenAI's Realtime API
- **Multi-Agent Handoff**: Intelligent routing and handoff between specialized agents
- **Agent-to-Agent Communication**: Agents can delegate tasks to other specialized agents
- **Multiple MCP Servers**: Integration with multiple Model Context Protocol (MCP) servers for tool access
- **Multiple Sessions**: Concurrent handling of multiple user sessions with proper isolation
- **Voice Activity Detection**: Server-side VAD for natural conversation flow
- **Twilio Phone Integration**: Built-in support for phone-based voice interactions via Twilio Media Streams API

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
- Twilio Media Streams (optional)

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

# Twilio Integration (optional)
# Set TWILIO_ENABLE=true to enable Twilio phone call support
TWILIO_ENABLE=false
# Full WebSocket URL for Twilio Media Stream (must use wss:// for production)
# Example: wss://ai-voice-agent.ilikeai.ca/media-stream
TWILIO_WEBHOOK_URL=wss://your-domain.com/media-stream
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
2. **Backend**: Express server with dual-channel WebSocket support:
   - **Web Channel**: Socket.IO for browser-based voice interactions
   - **Phone Channel**: Native WebSocket for Twilio Media Streams
3. **OpenAI Realtime API**: Handles voice-to-voice AI interactions
4. **MCP Servers**: Provide tools and capabilities to AI agents
5. **Twilio Integration** (optional): Phone call support via Twilio Media Streams API ⭐

For detailed architecture documentation, see:
- [Backend Architecture](./doc/backend-voice-ai-agent-design.md)
- [Frontend Audio Processing](./doc/frontend-audio-process.md)

## 📞 Twilio Phone Integration

**This is a major feature!** The system supports **dual-channel voice interactions**:
- 🌐 **Voice from Web**: Browser-based voice interactions via Socket.IO
- 📞 **Voice from Phone**: Phone call support via Twilio Media Streams API

Your AI agent can now handle both web-based and phone-based voice conversations seamlessly.

### Architecture

The backend supports two distinct voice interaction channels:

1. **Web Channel** (`/realtime-voice`):
   - Uses Socket.IO for WebSocket connections
   - Handles browser-based voice interactions
   - Frontend connects via `ws://localhost:4000/realtime-voice`

2. **Phone Channel** (`/media-stream`):
   - Uses native WebSocket for Twilio Media Streams
   - Handles phone call voice interactions
   - Twilio connects via `wss://your-domain.com/media-stream`

### Prerequisites

- Twilio account with a phone number
- Server accessible via HTTPS/WSS (for production)
- OpenAI API key with Realtime API access

### Configuration

1. **Enable Twilio Integration**:

   In your `backend/.env` file:
   ```env
   TWILIO_ENABLE=true
   TWILIO_WEBHOOK_URL=wss://your-domain.com/media-stream
   ```

   **Important**: `TWILIO_WEBHOOK_URL` must be the full WebSocket URL with `wss://` protocol for production use.

2. **Configure Twilio Phone Number**:

   In Twilio Console:
   - Go to **Phone Numbers** → **Manage** → **Active numbers**
   - Select your phone number
   - In the **"Voice & Fax"** section, set the webhook URL:
     ```
     https://your-domain.com/incoming-call
     ```
   - Set HTTP method to `POST`

### How It Works

1. **User calls** your Twilio phone number
2. **Twilio sends** HTTP POST to `/incoming-call` endpoint
3. **Server responds** with TwiML XML containing `<Stream>` directive pointing to `/media-stream`
4. **Twilio connects** to `/media-stream` WebSocket endpoint
5. **Real-time bidirectional audio streaming** begins between phone and AI agent
6. **AI agent processes** voice input and responds via phone

### Key Features

- **Phone-Optimized Agent**: Specialized `frontDeskAgentForPhone` agent for phone conversations
- **Phone Session Data**: Automatic retrieval of customer context based on phone number
- **Immediate Response**: Optimized for low latency with immediate session connection
- **Per-Call Isolation**: Each phone call gets its own isolated session
- **MCP Integration**: Full MCP server support for phone conversations

### Local Development

For local development, use a tunneling service like ngrok:

```bash
# Start ngrok
ngrok http 4000

# Use the HTTPS URL provided by ngrok
TWILIO_WEBHOOK_URL=wss://abc123.ngrok.io/media-stream
```

Then configure your Twilio webhook to point to `https://abc123.ngrok.io/incoming-call`.

### Documentation

For detailed Twilio integration documentation, see:
- [Backend README](./backend/README.md#-twilio-phone-integration)
- [Twilio Integration Guide](./backend/docs/twilio-integration.md)

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

# Realtime Voice AI Agent Backend

A production-ready backend server for realtime voice AI agents using OpenAI's Realtime API. This backend supports **dual-channel voice interactions**: both **web-based** and **phone-based** voice conversations through Twilio integration.

**Require: Node >= 16**

## ✨ Key Features

- **Dual-Channel Voice Support**: 
  - 🌐 **Voice from Web**: Real-time voice interactions via WebSocket (Socket.IO)
  - 📞 **Voice from Phone**: Phone call support via Twilio Media Streams API
- **Realtime Voice Interaction**: Bi-directional audio streaming with OpenAI's Realtime API
- **Multi-Agent System**: Intelligent routing and handoff between specialized agents
- **MCP Server Integration**: Integration with Model Context Protocol (MCP) servers for tool access
- **Multiple Sessions**: Concurrent handling of multiple user sessions with proper isolation
- **Voice Activity Detection**: Server-side VAD for natural conversation flow
- **Phone Session Management**: Automatic phone session data retrieval based on caller ID

## 🚀 Quick Start

### Install Dependencies & Setup Environment

```sh
cd backend
npm install
cp .env.example .env  # Or create .env manually
```

### Environment Configuration

Create a `.env` file in the `backend` directory with the following configuration:

```env
# OpenAI API Configuration (Required)
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-realtime

# Server Configuration (Optional, defaults to 4000)
PORT=4000

# Twilio Integration (Optional - Enable for phone call support)
# Set TWILIO_ENABLE=true to enable Twilio phone call support
TWILIO_ENABLE=false
# Full WebSocket URL for Twilio Media Stream (must use wss:// for production)
# Example: wss://ai-voice-agent.ilikeai.ca/media-stream
TWILIO_WEBHOOK_URL=wss://your-domain.com/media-stream
```

### Start Backend Application

**Development mode** (with auto-reload):
```sh
npm run dev
```

**Production mode**:
```sh
npm run start
```

The backend will start on `http://localhost:4000` (or the port specified in `PORT` environment variable).

## 📞 Twilio Phone Integration

This backend includes **built-in support for phone-based voice AI interactions** via Twilio Media Streams API. This is a major feature that enables your AI agent to handle phone calls in addition to web-based voice interactions.

### Architecture Overview

The system supports two distinct voice interaction channels:

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

#### 1. Enable Twilio Integration

In your `.env` file:
```env
TWILIO_ENABLE=true
TWILIO_WEBHOOK_URL=wss://your-domain.com/media-stream
```

**Important**: `TWILIO_WEBHOOK_URL` must be the full WebSocket URL with `wss://` protocol for production use.

#### 2. Configure Twilio Phone Number

In Twilio Console:
1. Go to **Phone Numbers** → **Manage** → **Active numbers**
2. Select your phone number
3. In the **"Voice & Fax"** section, set the webhook URL:
   ```
   https://your-domain.com/incoming-call
   ```
4. Set HTTP method to `POST`

### How It Works

1. **User calls** your Twilio phone number
2. **Twilio sends** HTTP POST to `/incoming-call` endpoint
3. **Server responds** with TwiML XML containing `<Stream>` directive pointing to `/media-stream`
4. **Twilio connects** to `/media-stream` WebSocket endpoint
5. **Real-time bidirectional audio streaming** begins between phone and AI agent
6. **AI agent processes** voice input and responds via phone

### Implementation Details

#### HTTP Route Handler (`/incoming-call`)

- **Location**: `src/service/twilio/http-route.ts`
- **Method**: Handles both GET and POST requests
- **Response**: Returns TwiML XML with `<Stream>` directive
- **Configuration**: Controlled by `TWILIO_ENABLE` and `TWILIO_WEBHOOK_URL` environment variables

#### WebSocket Server (`/media-stream`)

- **Location**: `src/service/websocket/index.ts` (`initTwilioWebSocketServer`)
- **Transport Layer**: Uses `TwilioRealtimeTransportLayer` from `@openai/agents-extensions`
- **Agent**: Uses `frontDeskAgentForPhone` - a specialized agent optimized for phone conversations
- **Session Management**: Each phone call gets its own isolated session
- **MCP Integration**: Connects to MCP servers in background after session establishment

#### Phone Session Agent

- **Location**: `src/service/open-ai/agents/phone-session-agent/`
- **Purpose**: Retrieves customer phone session data based on phone number
- **Tool**: `get_phone_session` - retrieves booking context, destination, dates, etc.

#### Front Desk Agent for Phone

- **Location**: `src/service/open-ai/agents/front-desk-agent-for-phone/`
- **Purpose**: Specialized agent for phone-based customer service
- **Features**:
  - Phone-optimized conversation flow
  - Immediate response acknowledgments
  - Phone session data integration
  - Tool calling with proper user feedback

### Local Development

For local development, use a tunneling service like ngrok:

```bash
# Start ngrok
ngrok http 4000

# Use the HTTPS URL provided by ngrok
TWILIO_WEBHOOK_URL=wss://abc123.ngrok.io/media-stream
```

Then configure your Twilio webhook to point to `https://abc123.ngrok.io/incoming-call`.

### Production Deployment

For production:
1. Deploy your backend to a server with HTTPS/WSS support
2. Set `TWILIO_WEBHOOK_URL` to your production WebSocket URL (must use `wss://`)
3. Configure Twilio webhook to point to your production `/incoming-call` endpoint
4. Ensure your server can handle WebSocket upgrades on `/media-stream` path

## 🌐 Web Voice Integration

The backend also supports web-based voice interactions via Socket.IO:

- **Endpoint**: `ws://localhost:4000/realtime-voice`
- **Protocol**: Socket.IO WebSocket
- **Handler**: `src/service/websocket/index.ts` (`initWebSocketServer`)
- **Session Management**: `src/service/open-ai/voice-session-manger.ts`

## 📁 Project Structure

```
backend/
├── src/
│   ├── index.ts                    # Main entry point
│   ├── misc/
│   │   └── logger.ts              # Logging configuration
│   └── service/
│       ├── open-ai/               # OpenAI Realtime API integration
│       │   ├── agents/            # AI agents
│       │   │   ├── front-desk-agent/              # Web agent
│       │   │   ├── front-desk-agent-for-phone/   # Phone agent ⭐
│       │   │   ├── phone-session-agent/          # Phone session data
│       │   │   └── ...                          # Other agents
│       │   ├── handle-realtime-voice.ts
│       │   ├── voice-session-manger.ts
│       │   └── index.ts
│       ├── twilio/                # Twilio integration ⭐
│       │   └── http-route.ts     # /incoming-call endpoint
│       ├── websocket/             # WebSocket handlers
│       │   └── index.ts          # Both web and Twilio WebSocket servers
│       └── mcp-server/            # MCP server integration
├── package.json
├── tsconfig.json
└── README.md
```

## 🛠️ Available Scripts

- `npm run dev` - Start development server with nodemon (auto-reload)
- `npm run start` - Compile TypeScript and start production server
- `npm run build` - Compile TypeScript to JavaScript
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

## 🔧 Customization

### Adding Your Own Agents

Replace or extend the demo agents in `src/service/open-ai/agents/`:

- `front-desk-agent/` - Main routing agent for web interactions
- `front-desk-agent-for-phone/` - Phone-optimized agent ⭐
- `hotel-booking-agent/` - Hotel booking agent (demo)
- `flight-booking-agent/` - Flight booking agent (demo)
- `car-rental-booking-agent/` - Car rental agent (demo)
- `post-booking-agent/` - Post-booking agent (demo)

### Adding Your Own MCP Servers

Create new MCP servers in `src/service/mcp-server/` and register them in `src/service/mcp-server/index.ts`.

## 📚 Documentation

For detailed architecture documentation, see:
- [Backend Architecture](../doc/backend-voice-ai-agent-design.md)
- [Twilio Integration Guide](./docs/twilio-integration.md) (coming soon)

## 🎯 Key Implementation Points

1. **Dual-Channel Support**: The backend handles both web and phone voice interactions simultaneously
2. **Agent Specialization**: Different agents for web (`front-desk-agent`) and phone (`front-desk-agent-for-phone`)
3. **Session Isolation**: Each connection (web or phone) gets its own isolated session
4. **MCP Integration**: MCP servers connect in background after session establishment for optimal performance
5. **Phone Session Data**: Automatic retrieval of customer context based on phone number
6. **Transport Layers**: Different transport layers for web (Socket.IO) and phone (Twilio Media Streams)

## 📝 License

MIT

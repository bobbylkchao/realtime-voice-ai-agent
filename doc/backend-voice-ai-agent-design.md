# Realtime Voice AI Agent Architecture

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Core Components](#core-components)
   - [OpenAI Realtime Agent](#openai-realtime-agent)
   - [OpenAI Realtime Session](#openai-realtime-session)
   - [Multiple Sessions Management](#multiple-sessions-management)
4. [Multi-Agent System](#multi-agent-system)
   - [Agent Architecture](#agent-architecture)
   - [Agent Types](#agent-types)
   - [Multi-Agent Handoff](#multi-agent-handoff)
   - [Agent2Agent Communication](#agent2agent-communication)
5. [MCP Server Integration](#mcp-server-integration)
   - [MCP Server Architecture](#mcp-server-architecture)
   - [Multiple MCP Servers](#multiple-mcp-servers)
   - [MCP Server Registration](#mcp-server-registration)
6. [WebSocket Communication](#websocket-communication)
7. [Audio Processing](#audio-processing)
8. [Session Lifecycle](#session-lifecycle)
9. [Error Handling](#error-handling)
10. [Future Enhancements](#future-enhancements)

## Overview

This system implements a realtime voice AI agent platform using OpenAI's Realtime API, enabling natural voice conversations with multiple specialized AI agents. The architecture supports concurrent user sessions, multiple agents with handoff capabilities, and integration with Model Context Protocol (MCP) servers for tool access.

### Key Features

- **Realtime Voice Interaction**: Bi-directional audio streaming with OpenAI's Realtime API
- **Multi-Session Support**: Concurrent handling of multiple user sessions
- **Multi-Agent System**: Specialized agents with intelligent routing and handoff
- **MCP Server Integration**: Tool access through multiple MCP servers
- **Agent-to-Agent Communication**: Agents can delegate tasks to specialized agents
- **Voice Activity Detection**: Server-side VAD for natural conversation flow

## System Architecture

```
┌─────────────────┐
│  Web Client     │
└────────┬────────┘
         │ WebSocket
         │ /realtime-voice (Socket.IO)
         ▼
┌─────────────────┐                    ┌─────────────────┐
│ WebSocket      │                    │ Twilio Phone    │
│ Server         │                    │ Call            │
│ (Socket.IO)    │                    └────────┬────────┘
└─────────────────┘                          │
         │                                    │ HTTP POST
         │                                    │ /incoming-call
         │                                    │
         │                          ┌────────▼────────┐
         │                          │ Twilio HTTP     │
         │                          │ Route Handler   │
         │                          └────────┬────────┘
         │                                    │
         │                                    │ WebSocket
         │                                    │ /media-stream
         │                                    │ (Native WS)
         │                                    ▼
         │                          ┌─────────────────┐
         │                          │ Twilio WebSocket│
         │                          │ Server          │
         └──────────────────────────┼─────────────────┘
                                    │
                                    │ TwilioRealtimeTransportLayer
                                    │
                                    ▼
                          ┌─────────────────┐
                          │ Voice Session   │
                          │ Manager         │
                          │ / Phone Session │
                          │ Manager         │
                          └────────┬────────┘
                                   │
                                   ▼
                          ┌─────────────────┐
                          │ RealtimeSession │
                          │ (per client/call)│
                          └────────┬─────────┘
                                   │
                                   ▼
                          ┌─────────────────┐
                          │ Front Desk      │
                          │ Agent           │
                          └────────┬────────┘
                                   │
            ┌──────────────────────┼──────────────────────┐
            │                      │                      │
            ▼                      ▼                      ▼
    ┌─────────────┐        ┌─────────────┐        ┌─────────────┐
    │ Hotel       │        │ Flight      │        │ Car Rental  │
    │ Booking     │        │ Booking     │        │ Booking     │
    │ Agent       │        │ Agent       │        │ Agent       │
    └─────────────┘        └─────────────┘        └─────────────┘
            │                      │                      │
            └──────────────────────┼──────────────────────┘
                                   │
                                   ▼
                          ┌─────────────────┐
                          │ MCP Servers     │
                          │ (Tools)         │
                          └─────────────────┘
```

## Core Components

### OpenAI Realtime Agent

The OpenAI Realtime Agent is the foundation of our voice interaction system. Each agent is configured with:

- **Name**: Identifies the agent's role
- **Voice**: Voice profile (e.g., 'marin', 'cedar')
- **Instructions**: System prompts defining behavior and capabilities
- **Tools**: Other agents that can be invoked as tools
- **MCP Servers**: External tool providers via Model Context Protocol

**Implementation Location**: `src/service/open-ai/agents/`

**Key Configuration**:
- Model: `gpt-realtime` (default)
- Audio Format: PCM, 24kHz sample rate
- VAD: Server-side voice activity detection
- Transcription: `gpt-4o-mini-transcribe`

### OpenAI Realtime Session

Each user connection gets a dedicated `RealtimeSession` instance that manages:

1. **Connection Lifecycle**: Connect, maintain, and disconnect from OpenAI Realtime API
2. **Audio Streaming**: Bidirectional PCM audio at 24kHz
3. **Event Handling**: Transport events, audio events, turn management
4. **Agent Orchestration**: Routes requests to the appropriate agent

**Session Configuration**:

```typescript
{
  model: 'gpt-realtime',
  config: {
    audio: {
      input: {
        turnDetection: {
          type: 'server_vad',
          create_response: true,
          interrupt_response: true,
          silence_duration_ms: 1500
        },
        format: {
          rate: 24000,
          type: 'audio/pcm'
        },
        transcription: {
          model: 'gpt-4o-mini-transcribe'
        }
      },
      output: {
        format: {
          rate: 24000,
          type: 'audio/pcm'
        },
        speed: 1.0
      }
    }
  }
}
```

**Session Events**:
- `transport_event`: Conversation items, transcriptions
- `audio`: Assistant audio chunks
- `audio_interrupted`: User interrupted assistant
- `turn_started`: Model begins generating response
- `turn_done`: Model completes response
- `error`: Session errors
- `connection_change`: Connection status updates

### Multiple Sessions Management

The `VoiceSessionManager` class manages multiple concurrent user sessions:

**Implementation**: `src/service/open-ai/voice-session-manger.ts`

**Key Features**:
- **Session Map**: `Map<clientId, RealtimeSession>` for O(1) session lookup
- **Per-Session MCP Servers**: Each session has its own MCP server connections
- **Graceful Cleanup**: Properly closes sessions and MCP connections on disconnect

**Session Operations**:
- `createUserSession(socket)`: Creates a new session for a client
- `getUserSession(clientId)`: Retrieves an existing session
- `closeUserSession(clientId)`: Closes session and cleans up resources

**Lifecycle Flow**:
1. Client connects via WebSocket
2. Client sends `SESSION_START` event
3. System creates `RealtimeSession` with agent configuration
4. MCP servers connect and register with the session
5. Session establishes connection to OpenAI Realtime API
6. Audio streaming begins
7. On disconnect, session and MCP connections close

## Multi-Agent System

### Agent Architecture

The system implements a hierarchical agent architecture where:

1. **Front Desk Agent**: Primary orchestrator that handles general queries and routes to specialists
2. **Specialized Agents**: Domain experts for specific tasks (hotel, flight, car rental, post-booking)

Each agent can:
- Handle voice conversations in its domain
- Transfer to other agents when needed
- Invoke MCP tools for external capabilities
- Call other agents as tools (Agent2Agent pattern)

### Agent Types

#### 1. Front Desk Agent

**Location**: `src/service/open-ai/agents/front-desk-agent/index.ts`

**Responsibilities**:
- Primary point of contact for users
- Handles general trip booking questions
- Routes specialized requests to domain agents
- Manages overall conversation flow

**Capabilities**:
- Direct conversation for general queries
- Tool invocation for hotel, car rental, and flight bookings
- Access to MCP servers for hotel search, weather, etc.

**Tools Registered**:
- `hotel_booking_expert`: HotelBookingAgent
- `car_rental_booking_expert`: CarRentalBookingAgent
- `flight_booking_expert`: FlightBookingAgent
- `post_booking_expert`: PostBookingAgent

#### 2. Hotel Booking Agent

**Location**: `src/service/open-ai/agents/hotel-booking-agent/index.ts`

**Responsibilities**:
- Specialized hotel booking assistance
- Weather information for destinations
- Transfer to other agents for non-hotel requests

**Voice**: Cedar

#### 3. Flight Booking Agent

**Location**: `src/service/open-ai/agents/flight-booking-agent/index.ts`

**Responsibilities**:
- Specialized flight booking assistance
- Weather information for destinations
- Transfer to Front Desk for other booking types

**Voice**: Cedar

#### 4. Car Rental Booking Agent

**Location**: `src/service/open-ai/agents/car-rental-booking-agent/index.ts`

**Responsibilities**:
- Specialized car rental booking assistance
- Weather information for destinations
- Transfer to Front Desk for other booking types

**Voice**: Cedar

#### 5. Post Booking Agent

**Location**: `src/service/open-ai/agents/post-booking-agent/index.ts`

**Responsibilities**:
- Help with existing bookings
- Cancel bookings
- Transfer to Front Desk for new bookings

**Voice**: Cedar

### Multi-Agent Handoff

The system supports intelligent agent handoff through two mechanisms:

#### 1. Explicit Transfer Instructions

Agents are instructed to transfer to the Front Desk Agent when requests are outside their domain:

```typescript
instructions: `
  3. Transfer to Front Desk Agent if the customer requests bookings 
     other than hotels, such as flights or car rentals.
`
```

#### 2. Tool-Based Handoff (Agent2Agent)

Specialized agents are registered as tools that the Front Desk Agent can invoke:

```typescript
tools: [
  hotelBookingAgent().asTool({
    toolName: 'hotel_booking_expert',
    toolDescription: 'Book a hotel for the user.',
  }),
  // ... other agents
]
```

**Handoff Flow**:
1. User makes a request to Front Desk Agent
2. Agent determines if specialized help is needed
3. Agent invokes specialized agent as a tool
4. Specialized agent handles the conversation
5. Control returns to Front Desk Agent

### Agent2Agent Communication

The Agent2Agent pattern enables agents to delegate tasks to specialized agents:

**Implementation Pattern**:
- Agents expose themselves as tools via `.asTool()` method
- Tool invocation triggers agent execution
- Context and conversation state are maintained
- Results are returned to the calling agent

**Benefits**:
- **Modularity**: Each agent handles its domain
- **Scalability**: Easy to add new specialized agents
- **Maintainability**: Clear separation of concerns
- **Flexibility**: Agents can compose complex workflows

**Example Flow**:
```
User: "I need to book a hotel in Paris"

Front Desk Agent:
  1. Recognizes hotel booking request
  2. Invokes hotel_booking_expert tool
  3. HotelBookingAgent takes over conversation
  4. Collects booking details
  5. Uses MCP tools to search hotels
  6. Returns booking confirmation
  7. Front Desk Agent continues conversation
```

## MCP Server Integration

### MCP Server Architecture

Model Context Protocol (MCP) servers provide external tool capabilities to agents:

**Benefits**:
- **Separation of Concerns**: Tools live in separate services
- **Scalability**: Each MCP server can scale independently
- **Modularity**: Easy to add/remove tool capabilities
- **Standardization**: MCP protocol standardizes tool access

### Multiple MCP Servers

The system supports multiple MCP servers per session:

**Implementation**: `src/service/mcp-server/index.ts`**

**Current MCP Servers**:

1. **Booking MCP Server**
   - URL: `http://localhost:4000/booking-mcp`
   - Tools:
     - `search-hotel`: Search hotels by location and dates
     - `get-destination-weather`: Get weather for destination cities

2. **Post Booking MCP Server**
   - URL: `http://localhost:4000/post-booking-mcp`
   - Tools:
     - `cancel-booking`: Cancel existing bookings

### MCP Server Registration

**Per-Session Connection**:
- Each session creates its own MCP server connections
- MCP servers are stored in `Map<clientId, MCPServerStreamableHttp[]>`
- Connections are established during session creation
- Properly closed during session cleanup

**Connection Flow**:
```typescript
for (const mcpServerConfig of mcpServerList) {
  const mcpServer = new MCPServerStreamableHttp({
    url: mcpServerConfig.url,
    name: mcpServerConfig.name,
  })
  await mcpServer.connect()
  mcpServers.set(clientId, [...(mcpServers.get(clientId) || []), mcpServer])
}
```

**MCP Server Implementation**:

Each MCP server:
- Extends `McpServer` from `@modelcontextprotocol/sdk`
- Registers tools with input/output schemas using Zod
- Handles HTTP POST requests at configured endpoints
- Uses `StreamableHTTPServerTransport` for communication

**Example Tool Registration**:
```typescript
mcpServer.registerTool(
  'search-hotel',
  {
    title: 'Search Hotel',
    description: 'Search hotels by location and dates',
    inputSchema: {
      city: z.string(),
      country: z.string(),
      checkInDate: z.string(),
      checkOutDate: z.string(),
    },
    outputSchema: {
      hotels: z.array(z.object({
        name: z.string(),
        address: z.string(),
        price: z.number(),
        rating: z.number(),
        availability: z.boolean(),
      })),
    },
  },
  async ({ city, country, checkInDate, checkOutDate }) => {
    // Tool implementation
    return {
      content: [{ type: 'text', text: JSON.stringify(output) }],
      structuredContent: output,
    }
  }
)
```

## WebSocket Communication

The WebSocket layer provides the communication bridge between clients and the voice AI system:

**Implementation**: `src/service/websocket/index.ts`

### Web Client WebSocket

**Configuration**:
- Transport: WebSocket only (no polling fallback)
- Path: `/realtime-voice`
- CORS: Configured for cross-origin access
- Library: Socket.IO

**Message Types**:

**Client → Server**:
- `SESSION_START`: Initialize a new voice session
- `SESSION_END`: Terminate the current session
- `USER_AUDIO_CHUNK`: Send audio data (ArrayBuffer)

**Server → Client**:
- `SESSION_START_SUCCESS`: Session created successfully
- `SESSION_START_ERROR`: Session creation failed
- `SESSION_END_SUCCESS`: Session closed successfully
- `SESSION_END_ERROR`: Session close failed
- `USER_AUDIO_TRANSCRIPT`: Transcription of user speech
- `ASSISTANT_AUDIO_TRANSCRIPT`: Transcription of assistant speech
- `ASSISTANT_AUDIO_CHUNK`: Audio data from assistant (ArrayBuffer)

**Event Handling**: `src/service/open-ai/handle-realtime-voice.ts`

### Twilio Media Stream WebSocket

The system supports integration with Twilio for phone-based voice interactions:

**Implementation**: `src/service/websocket/index.ts` (`initTwilioWebSocketServer`)

**Configuration**:
- Transport: Native WebSocket (using `ws` library)
- Path: `/media-stream`
- Protocol: Twilio Media Streams API
- Transport Layer: `TwilioRealtimeTransportLayer` from `@openai/agents-extensions`

**Twilio Integration Architecture**:

```
Phone Call → Twilio → /incoming-call (HTTP POST)
                      ↓
                  TwiML Response
                  <Stream url="wss://.../media-stream" />
                      ↓
                  Twilio connects to /media-stream (WebSocket)
                      ↓
            TwilioRealtimeTransportLayer
                      ↓
            RealtimeSession (OpenAI)
```

**Components**:

1. **HTTP Route Handler** (`src/service/twilio/http-route.ts`):
   - Endpoint: `/incoming-call`
   - Method: `ALL` (handles GET/POST)
   - Returns: TwiML XML response
   - Configurable via `TWILIO_ENABLE` and `TWILIO_WEBHOOK_URL` environment variables

2. **WebSocket Server** (`initTwilioWebSocketServer`):
   - Accepts Twilio Media Stream connections
   - Creates per-call `RealtimeSession` with `TwilioRealtimeTransportLayer`
   - Manages session lifecycle tied to WebSocket connection
   - Uses `callId` from `X-Twilio-Call-Sid` header for tracking

3. **Session Creation** (`src/service/open-ai/phone-session-manager.ts`):
   - `createTwilioVoiceAgentAndSession()` function
   - Connects to MCP servers per call
   - Creates `RealtimeSession` with `frontDeskAgent`
   - Handles tool approval and MCP tool calls

**Twilio Features**:
- **Bidirectional Audio**: Real-time audio streaming between phone and AI
- **Automatic Format Conversion**: Twilio transport layer handles audio format conversion
- **Per-Call Isolation**: Each phone call gets its own session and MCP connections
- **Connection Management**: Automatic cleanup on call termination

**Environment Variables**:
- `TWILIO_ENABLE`: Set to `'true'` to enable Twilio integration
- `TWILIO_WEBHOOK_URL`: Full WebSocket URL for Media Stream (e.g., `wss://ai-voice-agent.ilikeai.ca/media-stream`)

**Twilio Setup**:
1. Configure Twilio phone number webhook to point to `https://your-domain.com/incoming-call`
2. Set `TWILIO_ENABLE=true` in environment variables
3. Set `TWILIO_WEBHOOK_URL` to your public WebSocket URL (must be `wss://` for production)
4. Ensure server is accessible via HTTPS/WSS for production use

## Audio Processing

### Audio Format

- **Format**: PCM (Pulse Code Modulation)
- **Sample Rate**: 24kHz (24000 Hz)
- **Type**: `audio/pcm`
- **Direction**: Bidirectional streaming

### Voice Activity Detection (VAD)

**Configuration**:
- **Type**: `server_vad` (OpenAI server-side VAD)
- **Create Response**: Automatically create response after user stops speaking
- **Interrupt Response**: Allow user to interrupt assistant
- **Silence Duration**: 1500ms before considering turn complete

**Benefits of Server VAD**:
- No client-side processing required
- Consistent detection across devices
- Reduces client complexity
- Better accuracy with server-side processing

### Audio Streaming Flow

```
Client Mic → WebSocket → handleRealtimeVoice → 
RealtimeSession.sendAudio() → OpenAI Realtime API

OpenAI Realtime API → RealtimeSession.on('audio') → 
WebSocket → Client Speaker
```

## Session Lifecycle

### Session Creation

1. **Client Connection**: WebSocket connection established
2. **Session Start Event**: Client sends `SESSION_START`
3. **MCP Server Connection**: Connect to all configured MCP servers
4. **Agent Initialization**: Create Front Desk Agent with MCP servers
5. **RealtimeSession Creation**: Initialize with agent and configuration
6. **OpenAI Connection**: Connect to OpenAI Realtime API
7. **Event Handlers**: Register event listeners
8. **Session Storage**: Store session in `VoiceSessionManager`

### Session Active State

- **Audio Streaming**: Continuous bidirectional audio
- **Event Processing**: Handle transport events, transcripts, audio chunks
- **Agent Interaction**: Agent processes user input, generates responses
- **Tool Invocation**: Agents call tools and other agents as needed

### Session Termination

1. **Client Disconnect**: WebSocket disconnection event
2. **Session Close**: Call `session.close()` to disconnect from OpenAI
3. **MCP Server Cleanup**: Close all MCP server connections for the session
4. **Resource Cleanup**: Remove session from storage maps
5. **Logging**: Log session closure events

**Implementation**: `VoiceSessionManager.closeUserSession()`

## Error Handling

### Error Categories

1. **Session Creation Errors**:
   - Missing OpenAI API key
   - MCP server connection failures
   - OpenAI API connection failures

2. **Session Runtime Errors**:
   - Audio processing errors
   - Agent execution errors
   - Tool invocation errors

3. **Connection Errors**:
   - WebSocket disconnections
   - OpenAI API disconnections
   - MCP server disconnections

### Error Handling Strategy

**Graceful Degradation**:
- MCP server connection failures don't block session creation
- Logged as warnings, session continues without those tools
- Users can still interact with agents

**Error Communication**:
- Client receives error events via WebSocket
- Structured error messages with context
- Proper logging for debugging

**Logging**:
- All errors logged with structured context
- Client ID, error details, stack traces
- Uses Pino logger for structured logging

**Example Error Handling**:
```typescript
try {
  voiceSessionManager.createUserSession(socket)
  socket.emit('message', {
    event: 'SESSION_START_SUCCESS',
    data: null,
  })
} catch (error) {
  logger.error(
    { error, clientId: socket.id },
    '[Realtime Voice] Error occurred while creating Voice Session'
  )
  socket.emit('message', {
    event: 'SESSION_START_ERROR',
    data: null,
  })
}
```

## Future Enhancements

### Potential Improvements

1. **Session Persistence**:
   - Store session state for reconnection
   - Maintain conversation history across sessions

2. **Advanced Routing**:
   - Intent-based agent selection
   - Machine learning for optimal routing

3. **Multi-Language Support**:
   - Detect and handle multiple languages
   - Language-specific agents

4. **Enhanced MCP Integration**:
   - Dynamic MCP server discovery
   - MCP server health monitoring
   - Retry logic for MCP connections

5. **Analytics & Monitoring**:
   - Session metrics collection
   - Agent performance tracking
   - Conversation quality metrics

6. **Scalability Enhancements**:
   - Redis for session storage
   - Horizontal scaling support
   - Load balancing for MCP servers

7. **Security Enhancements**:
   - Authentication and authorization
   - Rate limiting per user
   - Audio data encryption

8. **Advanced Audio Features**:
   - Client-side VAD option
   - Audio quality optimization
   - Echo cancellation

## Technical Stack

- **Runtime**: Node.js (>=16.0.0)
- **Framework**: Express.js
- **WebSocket**: Socket.IO (web clients), native WebSocket via `ws` (Twilio)
- **AI Platform**: OpenAI Realtime API
- **Agent Framework**: @openai/agents, @openai/agents-realtime
- **Twilio Integration**: @openai/agents-extensions (TwilioRealtimeTransportLayer)
- **MCP Protocol**: @modelcontextprotocol/sdk
- **Logging**: Pino
- **Type Safety**: TypeScript
- **Validation**: Zod

## Conclusion

This architecture provides a scalable, modular foundation for realtime voice AI interactions. The multi-agent system with handoff capabilities, MCP server integration, and concurrent session management enables complex conversational workflows while maintaining code organization and extensibility.


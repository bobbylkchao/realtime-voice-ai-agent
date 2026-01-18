# Amazon Connect Phone Integration Progress

**Date**: 2026-01-17  
**Status**: In Progress - SIP Signaling Complete, RTP Audio Processing Pending  
**Priority**: Paused (focusing on other features)

---

## Project Overview

Implement Amazon Connect phone integration using External Voice Transfer to route calls to a custom SIP server, then use OpenAI Realtime API to provide real-time AI voice agent service.

### Architecture Diagram

```
Customer Call
   ↓
Amazon Connect (IVR Flow)
   ↓
External Voice Transfer Connector
   ↓
Custom SIP Server (Node.js)
   ↓
OpenAI Realtime API (AI Voice Agent)
   ↓
Return Voice Response to Customer
```

---

## Implementation Approach: External Voice Transfer

### Why External Voice Transfer?

1. **Real-time Bidirectional Communication**: External Voice Transfer supports real-time bidirectional audio streams, suitable for AI conversation scenarios
2. **Low Latency**: Direct SIP/RTP connection with low latency
3. **Full Control**: Complete control over audio processing pipeline
4. **Difference from Live Media Streaming**:
   - Live Media Streaming: Primarily for storage and analysis, does not support real-time bidirectional interaction
   - External Voice Transfer: Supports real-time bidirectional communication, suitable for AI agents

### External Voice Transfer Workflow

1. **Amazon Connect Side**:
   - Customer calls Amazon Connect number
   - IVR Flow executes "Transfer to External Voice System" block
   - Amazon Connect connects to our SIP server via SIP INVITE

2. **SIP Server Side**:
   - Receive SIP INVITE request
   - Respond with SIP 200 OK and negotiate SDP (Session Description Protocol)
   - Establish RTP media stream (bidirectional audio)

3. **Audio Processing**:
   - Receive RTP audio packets from customer
   - Decode audio (G.711 → PCM)
   - Resample (8kHz → 24kHz)
   - Send to OpenAI Realtime API

4. **AI Response**:
   - OpenAI generates voice response
   - Receive PCM audio from OpenAI (24kHz)
   - Resample (24kHz → 8kHz)
   - Encode to G.711
   - Package as RTP packets and send back to customer

---

## Code Structure

### File Organization

```
src/service/amazon-connect/
├── sip-server.ts                    # Export interface (re-exports sip-server-native.ts)
├── sip-server-native.ts             # Native Node.js SIP server implementation
├── amazon-connect-sip-transport-layer.ts  # OpenAI Transport Layer
└── http-route.ts                    # HTTP routes (health check, endpoint info, callbacks)
```

### Core Files Description

#### 1. `sip-server-native.ts`

**Purpose**: Implements native Node.js SIP server, handles SIP signaling

**Key Features**:
- UDP/TCP SIP server listening (default port 5060)
- SIP message parsing (INVITE, ACK, BYE, etc.)
- SIP response generation (200 OK, 100 Trying, etc.)
- SDP negotiation (generate SDP answer)
- Call session management (store active calls)
- OpenAI RealtimeSession integration

**Key Functions**:
- `initAmazonConnectSipServer()`: Initialize SIP server
- `parseSipMessage()`: Parse SIP messages
- `generateSipResponse()`: Generate SIP responses
- `handleSipInvite()`: Handle SIP INVITE requests
- `setupOpenAiSessionForSipCall()`: Setup OpenAI session for SIP call
- `cleanupSipCall()`: Cleanup SIP call

**Data Structure**:
```typescript
interface SipCall {
  callId: string
  from: string
  to: string
  contactId?: string
  session: RealtimeSession | null
  transportLayer: AmazonConnectSipTransportLayer | null
  socket: UDPSocket | TCPSocket
  remoteAddress: string
  remotePort: number
}
```

#### 2. `amazon-connect-sip-transport-layer.ts`

**Purpose**: Implements `RealtimeTransportLayer` interface, bridges SIP/RTP audio streams and OpenAI Realtime API

**Key Features**:
- Implements all methods of `RealtimeTransportLayer` interface
- Audio processing framework (actual RTP processing pending)
- Status management (connecting, connected, disconnected)
- Mute control

**Key Methods to Implement**:
- `processIncomingAudio()`: Process audio from SIP (RTP → PCM → OpenAI)
- `sendAudioToSip()`: Send audio to SIP (OpenAI → PCM → RTP)

#### 3. `http-route.ts`

**Purpose**: Provides HTTP endpoints for configuration and callbacks

**Endpoints**:
- `GET /amazon-connect/health`: Health check
- `GET /amazon-connect/sip-endpoint`: Returns SIP endpoint information
- `POST /amazon-connect/callback`: Receives Amazon Connect event callbacks

#### 4. `sip-server.ts`

**Purpose**: Simple re-export to maintain interface consistency

```typescript
export { initAmazonConnectSipServer, getSipCall } from './sip-server-native'
```

### Main Entry Integration

In `src/index.ts`:

```typescript
// Support phone call from Amazon Connect
if (process.env.AMAZONCONNECT_ENABLE === 'true') {
  // Initialize SIP server for External Voice Transfer
  initAmazonConnectSipServer().catch((error) => {
    logger.error(
      { error },
      '[Server] Failed to initialize Amazon Connect SIP server'
    )
  })
}
```

---

## Current Progress

### ✅ Completed

1. **SIP Server Basic Implementation**
   - ✅ UDP/TCP SIP server listening
   - ✅ SIP message parsing (INVITE, ACK, BYE)
   - ✅ SIP response generation (200 OK, 100 Trying)
   - ✅ SDP negotiation (generate SDP answer)
   - ✅ Call session management

2. **OpenAI Integration Framework**
   - ✅ `AmazonConnectSipTransportLayer` class implementation
   - ✅ `RealtimeTransportLayer` interface implementation
   - ✅ OpenAI RealtimeSession integration
   - ✅ MCP server connection

3. **HTTP Routes**
   - ✅ Health check endpoint
   - ✅ SIP endpoint information endpoint
   - ✅ Callback endpoint

4. **Code Cleanup**
   - ✅ Removed old KVS/WebRTC implementation
   - ✅ Removed all debugging tools
   - ✅ Cleaned up unnecessary dependencies

### ⚠️ Pending Implementation (Critical Features)

#### 1. RTP Audio Processing (Most Important)

**Current Status**: Framework ready, but actual RTP processing not yet implemented

**Needs Implementation**:

1. **RTP Packet Reception**
   - Create UDP socket to listen on RTP port (extract from SDP)
   - Parse RTP packet headers
   - Extract audio payload

2. **Audio Decoding**
   - G.711 μ-law (PCMU) decode → PCM
   - G.711 A-law (PCMA) decode → PCM
   - Or support Opus decoding (if Amazon Connect supports it)

3. **Audio Resampling**
   - Resample from 8kHz (telephony audio) to 24kHz (OpenAI requirement)
   - Use `speexdsp` or similar library

4. **Audio Encoding and Sending**
   - Resample OpenAI's PCM (24kHz, Int16Array) to 8kHz
   - Encode to G.711
   - Package as RTP packets
   - Send to Amazon Connect

**Recommended Libraries**:
```bash
npm install g711 node-g711 speexdsp
# Or use ffmpeg via subprocess
```

**Implementation Location**:
- Methods `processIncomingAudio()` and `sendAudioToSip()` in `amazon-connect-sip-transport-layer.ts`

#### 2. SIP Protocol Enhancements

- [ ] SIP OPTIONS support (for keep-alive)
- [ ] SIP authentication (if needed)
- [ ] SIP TLS support
- [ ] SRTP encryption support (optional, but recommended for production)

#### 3. Dynamic RTP Port Management

- [ ] Extract RTP port from SDP offer
- [ ] Dynamically allocate local RTP port
- [ ] RTP port range management

#### 4. Error Handling and Reconnection

- [ ] RTP stream disconnection handling
- [ ] SIP session timeout handling
- [ ] Network error recovery

---

## Environment Variables Configuration

Required in `.env` file:

```bash
# Amazon Connect enable flag
AMAZONCONNECT_ENABLE=true

# SIP server configuration
AMAZON_CONNECT_SIP_HOST=0.0.0.0          # SIP server listen address
AMAZON_CONNECT_SIP_PORT=5060             # SIP server port (UDP/TCP)
AMAZON_CONNECT_SIP_DOMAIN=sip.example.com # SIP domain (replace with actual domain or IP)
AMAZON_CONNECT_SIP_USERNAME=ai-agent    # SIP username
AMAZON_CONNECT_SIP_PASSWORD=your-password # SIP password (optional, for authentication)

# OpenAI configuration (if not already set)
OPENAI_API_KEY=your-openai-api-key
OPENAI_VOICE_MODEL=gpt-realtime
```

---

## Amazon Connect Configuration Requirements

### 1. AWS Support Quota Request

**Status**: Need to request External Voice Transfer Connector quota

**Request Information**:
- Region: Canada (Central) - ca-central-1
- Use Case: Individual customer use - AI-powered voice agent system
- Connector Source Type: Custom SIP server (Node.js)
- Voice System Type: Hosted Managed IVRs (custom AI voice agent)
- Concurrent Call Limit: 10 (testing) / [specify for production]

**Instance ARN**: `arn:aws:connect:ca-central-1:079488185933:instance/a3bfb68c-d644-4426-96ed-34efc1943527`

### 2. External Voice Transfer Connector Configuration

Create Connector in Amazon Connect console:
- **Name**: AI Voice Agent SIP Server
- **SIP URI**: `sip:ai-agent@your-domain.com:5060`
- **Transport**: UDP (or TCP/TLS)
- **Authentication**: Configure username and password if needed

### 3. IVR Flow Update

Add to Contact Flow:
- **Block**: "Transfer to External Voice System"
- **External Voice System**: Select created Connector
- **Timeout**: Set timeout duration
- **Error handling**: Configure error branch

---

## Technical Details

### SIP Protocol Handling

**Current Implementation**:
- Uses native Node.js `dgram` (UDP) and `net` (TCP) modules
- Manual SIP message parsing (text protocol)
- Generates standard SIP responses

**SIP Message Examples**:

**INVITE** (from Amazon Connect):
```
INVITE sip:ai-agent@sip.example.com SIP/2.0
Via: SIP/2.0/UDP ...
From: <sip:...>
To: <sip:ai-agent@sip.example.com>
Call-ID: ...
CSeq: 1 INVITE
Content-Type: application/sdp
Content-Length: ...

v=0
o=...
s=...
c=IN IP4 ...
m=audio 10000 RTP/AVP 0 8
a=rtpmap:0 PCMU/8000
a=rtpmap:8 PCMA/8000
```

**200 OK** (our response):
```
SIP/2.0 200 OK
Via: ...
From: ...
To: <sip:...>;tag=...
Call-ID: ...
CSeq: 1 INVITE
Contact: <sip:ai-agent@sip.example.com>
Content-Type: application/sdp
Content-Length: ...

v=0
o=- ... IN IP4 ...
s=Amazon Connect AI Agent
c=IN IP4 ...
t=0 0
m=audio 10000 RTP/AVP 0 8 101
a=rtpmap:0 PCMU/8000
a=rtpmap:8 PCMA/8000
a=rtpmap:101 telephone-event/8000
a=sendrecv
```

### RTP Protocol (Pending Implementation)

**RTP Packet Structure**:
```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|V=2|P|X|  CC   |M|     PT      |       sequence number         |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                           timestamp                           |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|           synchronization source (SSRC) identifier            |
+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+
|            contributing source (CSRC) identifiers            |
|                             ....                              |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                            payload                            |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

**Needs to Handle**:
- RTP header parsing
- Sequence number checking (detect packet loss)
- Timestamp handling
- Payload extraction (G.711 audio data)

### Audio Format Conversion

**Input Flow** (SIP → OpenAI):
```
RTP Packet (G.711 μ-law/A-law, 8kHz)
  ↓ decode
PCM (16-bit, 8kHz)
  ↓ resample
PCM (16-bit, 24kHz)
  ↓ convert
Int16Array (24kHz)
  ↓
OpenAI Realtime API
```

**Output Flow** (OpenAI → SIP):
```
OpenAI Realtime API
  ↓
Int16Array (24kHz)
  ↓ resample
PCM (16-bit, 8kHz)
  ↓ encode
G.711 μ-law/A-law (8kHz)
  ↓ package
RTP Packet
  ↓
Send to Amazon Connect
```

---

## Testing Plan

### Phase 1: SIP Signaling Test (Currently Testable)

1. **Start Service**:
   ```bash
   npm start
   ```

2. **Check Logs**:
   Should see:
   ```
   [Amazon Connect SIP] UDP SIP server listening
   [Amazon Connect SIP] TCP SIP server listening
   ```

3. **Test with SIP Client**:
   - Use Linphone or other SIP client
   - Connect to `sip:ai-agent@your-domain.com:5060`
   - Verify SIP INVITE is received
   - Verify SIP 200 OK response

4. **Test from Amazon Connect**:
   - Configure External Voice Transfer Connector
   - Update IVR Flow
   - Make a call
   - Verify SIP INVITE is received in logs

### Phase 2: RTP Audio Test (After Implementation)

1. Verify RTP packet reception
2. Verify audio decoding
3. Verify audio resampling
4. Verify bidirectional audio stream

---

## Known Issues and Limitations

1. **RTP Audio Processing Not Implemented**
   - Currently only handles SIP signaling
   - Cannot perform actual voice communication

2. **Simplified SIP Implementation**
   - Current implementation is basic version
   - Production environment recommended to use professional SIP server (Asterisk, FreeSWITCH)

3. **Missing Error Handling**
   - RTP stream disconnection handling
   - Network error recovery
   - Timeout handling

4. **Missing Authentication and Encryption**
   - Currently no SIP authentication support
   - No SIP TLS support
   - No SRTP support

---

## Next Steps Plan (When Resuming Development)

### Priority 1: Implement RTP Audio Processing

1. **Install Required Libraries**:
   ```bash
   npm install g711 node-g711 speexdsp
   # Or use ffmpeg
   ```

2. **Implement RTP Reception**:
   - Add RTP UDP socket in `sip-server-native.ts`
   - Extract RTP port from SDP
   - Parse RTP packets

3. **Implement Audio Decoding**:
   - G.711 decode to PCM
   - Implement in `amazon-connect-sip-transport-layer.ts`

4. **Implement Audio Resampling**:
   - 8kHz → 24kHz (input)
   - 24kHz → 8kHz (output)

5. **Implement Audio Encoding and Sending**:
   - PCM → G.711
   - Package as RTP packets
   - Send to Amazon Connect

### Priority 2: Enhance SIP Protocol

1. Add SIP OPTIONS support
2. Add SIP authentication (if needed)
3. Add error handling and reconnection logic

### Priority 3: Production Environment Optimization

1. Consider using professional SIP server (Asterisk/FreeSWITCH)
2. Add monitoring and logging
3. Implement high availability
4. Add SIP TLS and SRTP support

---

## Reference Resources

### AWS Documentation
- [Amazon Connect External Voice Transfer](https://aws.amazon.com/about-aws/whats-new/2024/12/amazon-connect-external-voice-transfers/)
- [Amazon Connect Contact Flows](https://docs.aws.amazon.com/connect/latest/adminguide/contact-flows.html)

### SIP/RTP Protocols
- [SIP RFC 3261](https://tools.ietf.org/html/rfc3261)
- [RTP RFC 3550](https://tools.ietf.org/html/rfc3550)
- [SDP RFC 4566](https://tools.ietf.org/html/rfc4566)

### Audio Codecs
- [G.711 (PCMU/PCMA)](https://en.wikipedia.org/wiki/G.711)
- [Audio Resampling](https://en.wikipedia.org/wiki/Sample-rate_conversion)

### Recommended Libraries
- `g711` / `node-g711`: G.711 codec
- `speexdsp`: Audio resampling
- `rtp-parser`: RTP packet parsing (if needed)

---

## Code Location Summary

### Key Files
- `src/service/amazon-connect/sip-server-native.ts`: Main SIP server implementation
- `src/service/amazon-connect/amazon-connect-sip-transport-layer.ts`: Transport Layer
- `src/service/amazon-connect/http-route.ts`: HTTP routes
- `src/index.ts`: Main entry, initializes SIP server

### Key Functions
- `initAmazonConnectSipServer()`: Initialize SIP server
- `handleSipInvite()`: Handle SIP INVITE
- `setupOpenAiSessionForSipCall()`: Setup OpenAI session
- `AmazonConnectSipTransportLayer.processIncomingAudio()`: Process incoming audio (pending)
- `AmazonConnectSipTransportLayer.sendAudioToSip()`: Send audio (pending)

---

## Checklist for Resuming Development

- [ ] Confirm AWS Support quota is approved
- [ ] Create External Voice Transfer Connector in Amazon Connect console
- [ ] Update IVR Flow to add External Voice Transfer block
- [ ] Configure environment variables
- [ ] Test SIP signaling (Phase 1)
- [ ] Implement RTP audio processing (Priority 1)
- [ ] Test bidirectional audio stream (Phase 2)
- [ ] Enhance error handling
- [ ] Production environment optimization

---

**Last Updated**: 2026-01-17  
**When Resuming Development**: Reference this document and code comments to continue implementing RTP audio processing functionality

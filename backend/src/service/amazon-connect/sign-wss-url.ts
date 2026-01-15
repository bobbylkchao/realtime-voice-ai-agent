import { URL } from 'url'
import { SignatureV4 } from '@aws-sdk/signature-v4'
import { HttpRequest } from '@aws-sdk/protocol-http'
import { AwsCredentialIdentity } from '@aws-sdk/types'
import { Sha256 } from '@aws-crypto/sha256-js'
import { formatUrl } from '@aws-sdk/util-format-url'
import logger from '../../misc/logger'

export const signWssUrl = async (
  wssUrl: string,
  region: string,
  channelArn: string,
  accessKeyId: string,
  secretAccessKey: string
): Promise<string> => {
  const url = new URL(wssUrl)

  // AWS KVS signaling channel requires GET method and proper query string format
  const pathname = url.pathname || '/'
  const hostname = url.hostname

  // Create credentials object for AWS SDK
  const credentials: AwsCredentialIdentity = {
    accessKeyId,
    secretAccessKey,
  }

  // Generate a unique client ID for Viewer role
  // AWS KVS WebRTC requires X-Amz-ClientId for Viewer connections
  const clientId = `viewer-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`

  // Create HTTP request object
  const request = new HttpRequest({
    method: 'GET',
    protocol: 'wss:',
    hostname,
    path: pathname,
    query: {
      'X-Amz-ChannelARN': channelArn,
      'X-Amz-ClientId': clientId, // Required for Viewer role
    },
    headers: {
      host: hostname,
    },
  })

  // Log before signing for debugging
  logger.debug(
    {
      hostname,
      path: pathname,
      region,
      service: 'kinesisvideo',
      channelArn,
      query: request.query,
    },
    '[Amazon Connect] Signing WebSocket URL with AWS SDK'
  )

  // Create signature v4 signer with SHA256
  const signer = new SignatureV4({
    credentials,
    region,
    service: 'kinesisvideo',
    sha256: Sha256,
    uriEscapePath: false,
  })

  // Presign the request (adds signature to query string)
  // Note: AWS KVS WebRTC may not require expiresIn for WebSocket connections
  // Try without expiresIn first, as WebSocket connections are typically short-lived
  const signedRequest = await signer.presign(request, {
    // Use a shorter expiration time (5 minutes) for WebSocket connections
    // Some AWS services don't accept expiresIn for WebSocket URLs
    expiresIn: 300,
  })

  // Use AWS SDK's formatUrl to properly format the signed URL
  // This ensures query parameters are correctly encoded and formatted
  const formattedUrl = formatUrl(signedRequest)
  
  // Convert http/https to wss (formatUrl returns http/https)
  const signedUrl = formattedUrl.replace(/^https?:/, 'wss:')

  logger.debug(
    {
      signedUrl,
      formattedUrl,
      query: signedRequest.query,
      path: signedRequest.path,
    },
    '[Amazon Connect] WebSocket URL signed with AWS SDK'
  )

  return signedUrl
}

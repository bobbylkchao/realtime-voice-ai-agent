import { MCPServerStreamableHttp } from '@openai/agents'
import logger from '../../misc/logger'
import { mcpServerList } from './index'

/**
 * Global MCP server connection manager
 * Connects to all MCP servers once at server startup and reuses them for all sessions
 */
class McpServerManager {
  private mcpServers: Map<string, MCPServerStreamableHttp> = new Map()
  private isInitialized = false
  private initializationPromise: Promise<void> | null = null

  /**
   * Initialize all MCP server connections
   * This should be called once at server startup
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    if (this.initializationPromise) {
      return this.initializationPromise
    }

    this.initializationPromise = this._initialize()
    return this.initializationPromise
  }

  private async _initialize(): Promise<void> {
    logger.info('[MCP Server Manager] Initializing MCP server connections...')

    // All MCP servers must connect successfully, or initialization fails
    const connectionPromises = mcpServerList.map(async (mcpServerConfig) => {
      try {
        const mcpServer = new MCPServerStreamableHttp({
          url: mcpServerConfig.url,
          name: mcpServerConfig.name,
        })
        await mcpServer.connect()
        this.mcpServers.set(mcpServerConfig.name, mcpServer)
        logger.info(
          {
            mcpServerName: mcpServerConfig.name,
            url: mcpServerConfig.url,
          },
          '[MCP Server Manager] MCP server connected successfully'
        )
      } catch (error) {
        logger.error(
          {
            error,
            mcpServerName: mcpServerConfig.name,
            url: mcpServerConfig.url,
          },
          '[MCP Server Manager] Failed to connect to MCP server'
        )
        throw error
      }
    })

    // If any MCP server fails to connect, Promise.all will reject
    // This ensures all servers must be available for the server to start
    await Promise.all(connectionPromises)

    this.isInitialized = true
    logger.info(
      {
        connectedCount: this.mcpServers.size,
        totalCount: mcpServerList.length,
      },
      '[MCP Server Manager] All MCP servers connected successfully'
    )
  }

  /**
   * Get all connected MCP servers
   * @param phoneCallOnly - If true, only return phone-call-only servers. If false, exclude them.
   */
  getMcpServers(phoneCallOnly: boolean = false): MCPServerStreamableHttp[] {
    const servers: MCPServerStreamableHttp[] = []
    for (const [name, server] of this.mcpServers.entries()) {
      const config = mcpServerList.find((c) => c.name === name)
      if (config) {
        if (phoneCallOnly && config.phoneCallOnly) {
          servers.push(server)
        } else if (!phoneCallOnly && !config.phoneCallOnly) {
          servers.push(server)
        }
      }
    }
    return servers
  }

  /**
   * Get a specific MCP server by name
   */
  getMcpServer(name: string): MCPServerStreamableHttp | undefined {
    return this.mcpServers.get(name)
  }

  /**
   * Check if all MCP servers are initialized
   */
  isReady(): boolean {
    return this.isInitialized
  }

  /**
   * Close all MCP server connections
   * This should be called during server shutdown
   */
  async closeAll(): Promise<void> {
    logger.info('[MCP Server Manager] Closing all MCP server connections...')
    const closePromises = Array.from(this.mcpServers.values()).map(
      async (server) => {
        try {
          await server.close()
          logger.info(
            { mcpServerName: server.name },
            '[MCP Server Manager] MCP server closed successfully'
          )
        } catch (error) {
          logger.error(
            { error, mcpServerName: server.name },
            '[MCP Server Manager] Error closing MCP server'
          )
        }
      }
    )

    await Promise.all(closePromises)
    this.mcpServers.clear()
    this.isInitialized = false
    this.initializationPromise = null
    logger.info('[MCP Server Manager] All MCP server connections closed')
  }
}

// Export singleton instance
export const mcpServerManager = new McpServerManager()


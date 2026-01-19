import { MCPServerStreamableHttp } from '@openai/agents'
import logger from '../../misc/logger'
import { mcpServerList } from './index'

/**
 * Singleton manager for MCP server connections.
 * Initializes all MCP servers at server startup and provides shared access.
 */
class McpServerManager {
  private static instance: McpServerManager | null = null
  private mcpServers: MCPServerStreamableHttp[] = []
  private initialized = false

  private constructor() {
    // Private constructor to enforce singleton pattern
  }

  /**
   * Get the singleton instance of McpServerManager
   */
  static getInstance(): McpServerManager {
    if (!McpServerManager.instance) {
      McpServerManager.instance = new McpServerManager()
    }
    return McpServerManager.instance
  }

  /**
   * Initialize all MCP server connections.
   * This must be called after the HTTP server is listening (to avoid ECONNREFUSED errors).
   * 
   * @throws Error if any MCP server connection fails
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.info('[McpServerManager] Already initialized, skipping')
      return
    }

    logger.info(
      { mcpServerCount: mcpServerList.length },
      '[McpServerManager] Initializing MCP server connections'
    )

    try {
      // Connect to all MCP servers concurrently
      // Use Promise.all to ensure all connections succeed (fail fast if any fail)
      const connectionPromises = mcpServerList.map(async (mcpServerConfig) => {
        const mcpServer = new MCPServerStreamableHttp({
          url: mcpServerConfig.url,
          name: mcpServerConfig.name,
        })
        await mcpServer.connect()
        this.mcpServers.push(mcpServer)
        logger.info(
          { mcpServerName: mcpServerConfig.name },
          '[McpServerManager] MCP server connected successfully'
        )
        return mcpServer
      })

      await Promise.all(connectionPromises)

      this.initialized = true
      logger.info(
        { mcpServerCount: this.mcpServers.length },
        '[McpServerManager] All MCP servers initialized successfully'
      )
    } catch (error) {
      logger.error(
        { error, mcpServerCount: this.mcpServers.length },
        '[McpServerManager] Error initializing MCP servers - server must exit'
      )
      // Close any successfully connected servers before throwing
      await this.closeAll()
      throw error
    }
  }

  /**
   * Get connected MCP servers, optionally filtered by phoneCallOnly flag.
   * 
   * @param phoneCallOnly - If false, return only servers with phoneCallOnly: false
   *                       If true, return ALL servers (both phoneCallOnly: true and false)
   *                       If undefined, return all servers
   * @returns Array of connected MCP servers
   */
  getMcpServers(phoneCallOnly?: boolean): MCPServerStreamableHttp[] {
    if (!this.initialized) {
      logger.warn(
        '[McpServerManager] getMcpServers called before initialization'
      )
      return []
    }

    if (phoneCallOnly === undefined) {
      return [...this.mcpServers]
    }

    if (phoneCallOnly === true) {
      // Return ALL servers when phoneCallOnly = true
      return [...this.mcpServers]
    }

    // phoneCallOnly = false: return only servers with phoneCallOnly: false
    return this.mcpServers.filter((server) => {
      const config = mcpServerList.find((c) => c.name === server.name)
      return config?.phoneCallOnly === false
    })
  }

  /**
   * Close all MCP server connections.
   * Used during server shutdown or error recovery.
   */
  async closeAll(): Promise<void> {
    logger.info(
      { mcpServerCount: this.mcpServers.length },
      '[McpServerManager] Closing all MCP server connections'
    )

    const closePromises = this.mcpServers.map(async (mcpServer) => {
      try {
        await mcpServer.close()
        logger.info(
          { mcpServerName: mcpServer.name },
          '[McpServerManager] MCP server closed successfully'
        )
      } catch (error) {
        logger.error(
          { error, mcpServerName: mcpServer.name },
          '[McpServerManager] Error closing MCP server'
        )
      }
    })

    await Promise.allSettled(closePromises)
    this.mcpServers = []
    this.initialized = false

    logger.info('[McpServerManager] All MCP server connections closed')
  }
}

// Export singleton instance
export const mcpServerManager = McpServerManager.getInstance()


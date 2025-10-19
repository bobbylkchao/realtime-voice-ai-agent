import OpenAI from 'openai'
import logger from '../../misc/logger'

export let openAiClient: OpenAI

export const initOpenAiClient = () => {
  const openAiOrganization = process.env.OPENAI_ORGANIZATION_ID
  const openAiProject = process.env.OPENAI_PROJECT_ID
  const openAiApiKey = process.env.OPENAI_API_KEY

  if (
    !openAiOrganization ||
    !openAiProject ||
    !openAiApiKey
  ) {
    logger.error('OpenAI API configuration is missing, please check the .env file!')
    return process.exit(1)
  }

  openAiClient = new OpenAI({
    organization: openAiOrganization,
    project: openAiProject,
    apiKey: openAiApiKey,
  })
  logger.info('OpenAI client has been initialized.')
}

// TODO: choose model https://platform.openai.com/docs/models
// Need logic/schedule to check account balance
export const getModel = (): string => {
  return process.env.OPENAI_MODEL || 'gpt-3.5-turbo'
}

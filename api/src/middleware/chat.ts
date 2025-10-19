import { RequestHandler } from 'express'
import { body, validationResult } from 'express-validator'
import logger from '../misc/logger'
import { chatBotServiceEntry } from '../service/chat-bot'
import { IMessage } from '../service/chat-bot/type'
import { messageResponseFormat } from '../service/chat-bot/misc/message-response-format'

export const chatMiddleware: RequestHandler = async (req, res) => {
  const { messages }: { messages: IMessage[] } = req.body

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  try {
    // await chatBotServiceEntry(botId, messages, req, res)
    res.write(messageResponseFormat('Hello!'))
    res.end()
  } catch (error) {
    logger.error(error, 'Encountered an error when processing chat')

    let errorMessage = '';

    if (error instanceof Error) {
      errorMessage = messageResponseFormat(`Encountered an error when processing chat. ${error.message || ''}`)
    } else {
      errorMessage = messageResponseFormat('Encountered an unknown error')
    }

    res.write(errorMessage)
    res.end()
  }
}

export const validatorHandler: RequestHandler = (req, res, next) => {
  const error = validationResult(req).mapped()
  if (Object.keys(error).length > 0) {
    res.status(400).json({ message: 'Validation error', error })
    return
  }
  next()
}

export const requestValidator = [
  body('messages').isArray().withMessage('Messages must be an array'),
  body('messages.*.role')
    .isString()
    .withMessage('Each message must have a role as a string')
    .notEmpty()
    .isIn(['system', 'user', 'assistant'])
    .withMessage('Role must be either "system" or "user"'),
  body('messages.*.content')
    .isString()
    .withMessage('Each message must have a content as a string')
    .notEmpty()
    .withMessage('content cannot be empty'),
  validatorHandler,
]

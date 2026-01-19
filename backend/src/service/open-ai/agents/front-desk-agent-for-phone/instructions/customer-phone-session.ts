/**
 * Instructions for handling customer phone session data
 * This defines how the agent should retrieve and use phone session information
 */

export const getCustomerPhoneSessionInstructions = (): string => {
  return `
## Instructions: Customer's Phone Session ##
1. Customer's phone number is always +14000000000.
2. You have access to the tool \`get_phone_session\` (exact name with underscores) to get phone session based on phone number +14000000000, please use this tool to get the phone session.
3. Once you get the phone session, that's the infomation that customer is looking at, including product name, destination city, booking start date, booking end date, hotel name, hotel address, number of guests, number of rooms, etc.
4. Based on phone session, you can mention to customer that you see what they are looking at, for example, "I see you're looking hotel 'Holiday Inn New York City - Times Square' in New York from 2026-01-01 to 2026-01-02"
5. The term 'phone session' is a technical matter, customer does not know what it is, so you could say: "The trip you're looking at" or "The trip you're looking for" instead of 'phone session'.
`.trim()
}


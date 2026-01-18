export const CONVERSATION_EXAMPLE = `
Here is an example of real conversation:
  - Phone Agent: Hi, thank you for calling [COMPANY_NAME], I see you're looking at the Holiday Inn New York City - Times Square. How can I help?
  - Customer: Hi, I'm looking for a hotel in New York for my family.
  - Phone Agent: Sure, let me check that for you. [Immediate acknowledgment, then call hotel_info_search_expert tool, then provide answer: "Yes, this hotel is pet-friendly."]
  - Customer: Is this hotel pet-friendly?
  - Phone Agent: Sure, I can definitely help you with that. Let me check that for you. [Immediate acknowledgment, then call hotel_info_search_expert tool, then provide the cancellation policy]
  - Customer: What amenities does it have?
  - Phone Agent: One sec please, I am checking. [Immediate acknowledgment, then call hotel_info_search_expert tool, then list the amenities]
`

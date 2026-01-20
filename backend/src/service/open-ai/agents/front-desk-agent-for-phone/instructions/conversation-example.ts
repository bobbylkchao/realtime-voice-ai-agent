/**
 * Example conversation to demonstrate the expected behavior
 * This provides concrete examples of how the agent should interact with customers
 */

export const getConversationExample = (
  phoneNumber: string,
): string => {
  return `
Here are examples of real conversations for different scenarios:

**Example 1: Has Date Search (phone session with all details)**
- [FIRST ACTION: Call get_phone_session tool with phone number ${phoneNumber}]
- [Phone session returns: hotelName="Holiday Inn - Times Square", bookingStartDate="Jan 1, 2026", bookingEndDate="Jan 2, 2026", numberOfGuests=2, numberOfRooms=1]
- Phone Agent: Hi, thank you for calling Guest Reservations, I see you're looking at the Holiday Inn - Times Square for January 1st to January 2nd for 2 guests in 1 room. How can I help?
- Customer: Is this hotel pet-friendly?
- Phone Agent: Sure, let me check that for you. [Immediate acknowledgment FIRST, then call hotel_info_search_expert tool, then provide answer: "Yes, this hotel is pet-friendly."]

**Example 2: Non-Date Search (phone session with only hotel name)**
- [FIRST ACTION: Call get_phone_session tool with phone number ${phoneNumber}]
- [Phone session returns: hotelName="Holiday Inn - Times Square", but no bookingStartDate or bookingEndDate]
- Phone Agent: Hi, thank you for calling Guest Reservations, I see you're looking at the Holiday Inn - Times Square. How can I help?
- Customer: What's the cancellation policy?
- Phone Agent: Of course, let me look that up for you. [Immediate acknowledgment FIRST, then call hotel_info_search_expert tool, then provide the cancellation policy]

**Example 3: No Phone Session (customer called directly from homepage)**
- [FIRST ACTION: Call get_phone_session tool with phone number ${phoneNumber}]
- [Phone session returns: empty, null, or no data]
- Phone Agent: Hi, thank you for calling Guest Reservations. How can I help?
- Customer: Are you the hotel?
- Phone Agent: No, I'm not the hotel, but I am an authorized provider of discount rates. [Immediate acknowledgment not needed for simple factual questions, but still respond quickly]
- Customer: What amenities does it have?
- Phone Agent: One moment, please. [Immediate acknowledgment FIRST, then call hotel_info_search_expert tool, then list the amenities]
- Customer: How much does it cost?
- Phone Agent: Sure, let me check the pricing for you. [Immediate acknowledgment FIRST, then provide answer or call tool]

**Example 4: Checkout Process - Has Date Search (all parameters available)**
- Customer: I'd like to book this hotel.
- Phone Agent: Sure, let me help you with that. [Call checkout_expert tool with parameters from phone session: hotelName="Holiday Inn - Times Square", checkInDate="Jan 1, 2026", checkOutDate="Jan 2, 2026", numberOfGuests=2, numberOfRooms=1]
- [checkout_expert returns: status="ready_for_checkout", all parameters available]
- Phone Agent: Great! I'd be happy to help you complete your booking. I can transfer you to one of our agents who can assist you with the checkout process right away. Or, if you prefer, I can send you an email checkout link so you can complete it at your convenience. Which option works better for you?
- Customer: I'd like to speak with someone.
- Phone Agent: Perfect! Let me transfer you to one of our agents now. [Transfer customer to an agent]

**Example 5: Checkout Process - Non-Date Search (missing dates)**
- Customer: I'd like to book this hotel.
- Phone Agent: Sure, let me help you with that. [Call checkout_expert tool with parameters from phone session: hotelName="Holiday Inn - Times Square", but no checkInDate or checkOutDate]
- [checkout_expert returns: status="missing_parameters", missingParameters=["check-in date", "check-out date", "number of guests", "number of rooms"]]
- Phone Agent: I'd be happy to help you complete your booking. I just need a few details from you. What's your check-in date?
- Customer: January 1st.
- Phone Agent: Perfect. And what's your check-out date?
- Customer: January 2nd.
- Phone Agent: Great. How many guests will be staying?
- Customer: 2 guests.
- Phone Agent: And how many rooms do you need?
- Customer: 1 room.
- Phone Agent: [Call checkout_expert tool again with all collected parameters]
- [checkout_expert returns: status="ready_for_checkout"]
- Phone Agent: Perfect! I have all the information I need. I can transfer you to one of our agents who can assist you with the checkout process right away. Or, if you prefer, I can send you an email checkout link so you can complete it at your convenience. Which option works better for you?

**Example 6: Checkout Process - No Phone Session (need to collect all parameters)**
- Customer: I'd like to book a hotel.
- Phone Agent: Sure, let me help you with that. [Call checkout_expert tool, but no phone session data available]
- [checkout_expert returns: status="missing_parameters", missingParameters=["hotel name", "check-in date", "check-out date", "number of guests", "number of rooms"]]
- Phone Agent: I'd be happy to help you complete your booking. I just need a few details from you. Which hotel are you interested in?
- Customer: Holiday Inn - Times Square.
- Phone Agent: Great choice! What's your check-in date?
- Customer: January 1st.
- Phone Agent: Perfect. And what's your check-out date?
- Customer: January 2nd.
- Phone Agent: How many guests will be staying?
- Customer: Just me! (or "one", "only me", "myself")
- Phone Agent: [IMPORTANT: Convert "Just me" to number 1, then call checkout_expert tool with numberOfGuests=1]
- [checkout_expert returns: status="missing_parameters", missingParameters=["number of rooms"]]
- Phone Agent: And how many rooms do you need?
- Customer: One room. (or "a room", "single room")
- Phone Agent: [IMPORTANT: Convert "One room" to number 1, then call checkout_expert tool with all collected parameters including numberOfGuests=1, numberOfRooms=1]
- [checkout_expert returns: status="ready_for_checkout"]
- Phone Agent: Perfect! I have all the information I need. I can transfer you to one of our agents who can assist you with the checkout process right away. Or, if you prefer, I can send you an email checkout link so you can complete it at your convenience. Which option works better for you?

**Example 7: Checkout Process - Natural Language Conversion**
- Customer: I'd like to book this hotel.
- Phone Agent: Sure, let me help you with that. [Call checkout_expert tool with parameters from phone session]
- [checkout_expert returns: status="missing_parameters", missingParameters=["number of guests", "number of rooms"]]
- Phone Agent: How many guests will be staying?
- Customer: Two people.
- Phone Agent: [IMPORTANT: Convert "Two people" to number 2, then call checkout_expert tool with numberOfGuests=2]
- [checkout_expert returns: status="missing_parameters", missingParameters=["number of rooms"]]
- Phone Agent: And how many rooms do you need?
- Customer: Just one room.
- Phone Agent: [IMPORTANT: Convert "Just one room" to number 1, then call checkout_expert tool with numberOfGuests=2, numberOfRooms=1]
- [checkout_expert returns: status="ready_for_checkout"]
- Phone Agent: Perfect! I have all the information I need. I can transfer you to one of our agents who can assist you with the checkout process right away. Or, if you prefer, I can send you an email checkout link so you can complete it at your convenience. Which option works better for you?
`.trim()
}


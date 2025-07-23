// import OpenAI from "openai";
// import dotenv from "dotenv";
// import prompt from "./advprompt.js";
// import { IS_PROD, SECRET_KEY, SECRET_KEY_SECRET } from "./index.js";
// dotenv.config();
// const openai = new OpenAI({
//   apiKey: IS_PROD ? SECRET_KEY_SECRET.value() : SECRET_KEY,
// });

// async function chat(userText, messages, sid) {
//   // Always ensure the system prompt is present at the start
//   if (messages.length === 0 || messages[0].role !== "system") {
//     messages.unshift({
//       role: "system",
//       content: prompt, // use your imported prompt
//     });
//   }
//   messages.push({ role: "user", content: userText });
//   const completion = await openai.chat.completions.create({
//     model: "gpt-4.1-nano",
//     messages: messages,
//     user:sid,
//     response_format: { type: "json_object" },
//   });
//   const jsonData = JSON.parse(completion.choices[0].message.content.trim());
//   console.log("AI:", completion.choices[0].message.content.trim());
//   messages.push({
//     role: "assistant",
//     content: completion.choices[0].message.content.trim(),
//   });
//   console.log("Current conversation history:", messages);
//   return { jsonData, messages };
// }

// export default chat;

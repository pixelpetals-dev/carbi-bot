import OpenAI from "openai";
import dotenv from "dotenv";
import sysProm from "./system_prompt.js";
import prompt from "./prompt.js";
import systemPrompt from "./advprompt.js";
import readlineSync from "readline-sync";
dotenv.config();
const openai = new OpenAI({
  apiKey: process.env.MY_KEY,
});
const messages = [
  {
    role: "system",
    content: sysProm,
  },
];

export default async function chat(userText) {
  messages.push({
    role: "user",
    content: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: " I want endmills",
      },
    ],
  });
  while (true) {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      store: true,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: "can you tell me about endmills?",
        },
      ],
      response_format: { type: "json_object" },
    });
    const jsonData = JSON.parse(completion.choices[0].message.content.trim());
    console.log("jsonData", completion.choices[0].message.content.trim());

    messages.push({
      role: "assistant",
      content: `${JSON.stringify(jsonData)}`,
    });
    return jsonData;
  }
}
chat("can you tell me about endmills?");

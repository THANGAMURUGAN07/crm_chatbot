import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import mysql from "mysql2";
import { ChatOllama } from "@langchain/community/chat_models/ollama";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { ChatMessageHistory } from "langchain/stores/message/in_memory";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

// ✅ MySQL DB
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "THANGAM123",
  database: "chatbot_db"
});
db.connect(err => {
  if (err) console.error("❌ MySQL error:", err.message);
  else console.log("✅ Connected to chatbot_db");
});

// ✅ Ollama AI model
const model = new ChatOllama({ model: "gemma:2b", temperature: 0.7 });

// ✅ Prompt
const prompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are a helpful assistant.
✅ You can answer about CRM, MongoDB, databases, programming, technology, sports, entertainment, science, and general topics *only if the user specifically asks*.
⚠ For customer data, use only what the server provides — never guess or invent data.
✅ When listing items, always format as HTML <ul><li>...</li></ul> instead of markdown.`
  ],
  new MessagesPlaceholder("history"),
  ["human", "{input}"]
]);

// ✅ Session memory
const memoryStore = {};
function getMemory(sessionId) {
  if (!memoryStore[sessionId]) {
    memoryStore[sessionId] = { history: new ChatMessageHistory(), context: {} };
  }
  return memoryStore[sessionId];
}

// ✅ Format customer data
function formatCustomerData(data) {
  const lastContact = data.last_contact ? new Date(data.last_contact).toISOString().split('T')[0] : 'N/A';
  return `😊 Sure! Here’s what I found:
📌 ID: ${data.id}
🙂 Name: ${data.name}
📧 Email: ${data.email}
📱 Phone: ${data.phone}
🏢 Company: ${data.company}
📝 Status: ${data.status}
🗓️ Last Contact: ${lastContact}
💡 Source: ${data.source}
📝 Notes: ${data.notes}`;
}

// ✅ Synonyms
const synonyms = {
  "mail": "email", "email": "email",
  "mobile": "phone", "mobile number": "phone", "contact number": "phone", "phone": "phone",
  "status": "status", "company": "company", "notes": "notes",
  "last contact": "last_contact", "contacted": "last_contact",
  "source": "source"
};

// ✅ Greetings
const greetings = [
  "hi", "hello", "hey", "good morning", "good evening", "good afternoon", "good night",
  "how are you", "thanks", "thank you", "thank u", "bye", "goodbye", "see you later"
];

// ✅ Known keywords for AI fallback
const knownTopics = [
  "chatbot","crm","mongodb","database","databases","programming","technology",
  "sports","entertainment","science","ai","artificial intelligence","bot"
];

app.post("/chat", async (req, res) => {
  const userMessage = req.body.message.toLowerCase();
  const sessionId = req.body.sessionId || "default";
  const { history, context } = getMemory(sessionId);

  try {
    await history.addMessage(new HumanMessage(userMessage));

    // ✅ Step 1: detect customer ID
    const idMatch = userMessage.match(/customer[n]*\s*(\d+)/i);
    if (idMatch) {
      const customerId = idMatch[1];
      context.lastCustomerId = customerId;
      db.query("SELECT * FROM crm_records WHERE id = ?", [customerId], (err, results) => {
        if (err || !results.length) return res.json({ response: `❌ Sorry, I couldn't find customer ${customerId}.` });
        context.lastCustomerName = results[0].name;
        return res.json({ response: formatCustomerData(results[0]) });
      });
      return;
    }

    // ✅ Step 2: next customer
    if (/next customer/.test(userMessage) && context.lastCustomerId) {
      db.query("SELECT * FROM crm_records WHERE id > ? ORDER BY id ASC LIMIT 1", [context.lastCustomerId], (err, results) => {
        if (err || !results.length) return res.json({ response: "❌ Sorry, no next customer found." });
        context.lastCustomerId = results[0].id;
        context.lastCustomerName = results[0].name;
        return res.json({ response: formatCustomerData(results[0]) });
      });
      return;
    }

    // ✅ Step 3: detect by name — now smarter
    const nameMatch = userMessage.match(/(?:about|details of|tell me about|who is|show details for|give me details of)\s+([a-z\s]+)/i);
    if (nameMatch) {
      const name = nameMatch[1].trim();

      // ✅ Check if name is actually a known topic → skip DB & ask AI
      if (knownTopics.includes(name)) {
        const fullPrompt = await prompt.formatMessages({ input: userMessage, history: await history.getMessages() });
        const response = await model.invoke(fullPrompt);
        await history.addMessage(new AIMessage(response.content));
        return res.json({ response: `😊 ${response.content}` });
      }

      // else assume it might be a customer
      context.lastCustomerName = name;
      db.query("SELECT * FROM crm_records WHERE name LIKE ? LIMIT 1", [`%${name}%`], (err, results) => {
        if (err || !results.length) return res.json({ response: `❌ Sorry, couldn't find customer "${name}".` });
        context.lastCustomerId = results[0].id;
        return res.json({ response: formatCustomerData(results[0]) });
      });
      return;
    }

    // ✅ Step 4: field-specific
    for (let keyword in synonyms) {
      if (userMessage.includes(keyword) && (context.lastCustomerId || context.lastCustomerName)) {
        const dbField = synonyms[keyword];
        if (context.lastCustomerId) {
          db.query(`SELECT ?? FROM crm_records WHERE id = ?`, [dbField, context.lastCustomerId], (err, results) => {
            if (err || !results.length) return res.json({ response: `❌ Couldn't find ${dbField}.` });
            return res.json({ response: `😊 ${dbField.replace('_', ' ').toUpperCase()} of customer ${context.lastCustomerId}: ${results[0][dbField] || 'N/A'}` });
          });
          return;
        }
      }
    }

    // ✅ Step 5: details of him/her
    if (/details of him|details about him|details of her|details about her|details of the customer|details about the customer/i.test(userMessage)) {
      if (context.lastCustomerId) {
        db.query("SELECT * FROM crm_records WHERE id = ?", [context.lastCustomerId], (err, results) => {
          if (err || !results.length) return res.json({ response: `❌ Sorry, couldn't find last customer data.` });
          return res.json({ response: formatCustomerData(results[0]) });
        });
        return;
      }
    }

    // ✅ Step 5.5: greetings
    if (greetings.some(greet => userMessage.includes(greet))) {
      let reply = "😊 Hello! How can I assist you today?";
      if (userMessage.includes("good morning")) reply = "☀️ Good morning! How can I help?";
      else if (userMessage.includes("good evening")) reply = "🌙 Good evening! What can I do for you?";
      else if (userMessage.includes("good afternoon")) reply = "🌤 Good afternoon! How may I assist?";
      else if (userMessage.includes("good night")) reply = "😴 Good night! Feel free to ask me anything before bed.";
      else if (userMessage.includes("how are you")) reply = "🤗 I'm just a bot, but I'm doing great! How can I help you?";
      else if (userMessage.includes("thank")) reply = "🙏 You're welcome! Happy to help.";
      return res.json({ response: reply });
    }

    // ✅ Step 6: AI fallback
    const fullPrompt = await prompt.formatMessages({ input: userMessage, history: await history.getMessages() });
    const response = await model.invoke(fullPrompt);
    await history.addMessage(new AIMessage(response.content));
    return res.json({ response: `😊 ${response.content}` });

  } catch (err) {
    console.error("❌ Chat error:", err.message);
    res.status(500).json({ error: "Internal server error." });
  }
});

app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));

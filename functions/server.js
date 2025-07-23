import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import chat from "./demo.js";
import prompt from "./advprompt.js";
import { randomUUID } from "node:crypto";
import cookieParser from "cookie-parser";
import {
  allProducts,
  productsByCategory,
  productsByNameLike,
  productBySKU,
  FilteredProductListQuery,
  FilteredProductListQueryFromSQL // <-- new import
} from "./productService.js";

dotenv.config();
const app = express();
const PORT = 3300;

app.use(cookieParser());
app.use(cors());
app.use(bodyParser.json());
if (process.env.NODE_ENV !== "production") {
  app.get("/bot/debug", (req, res) => {
    const sid = req.cookies.sid;
    if (!sid) {
      return res.status(400).json({ error: "No sid cookie present. Hit /session first." });
    }
    const history = sessionStore.get(sid) || [];
    res.json({
      sid,
      turns: history.length,
      history    // full message array
    });
  });
}

// In-memory store for session histories
const sessionStore = new Map();

app.get("/", (req, res) => {
  res.send("success");
});

// Unified chat endpoint with session handling
app.post("/bot", async (req, res) => {
  const userText = req.body?.message;
  if (typeof userText !== "string" || userText.trim().length === 0) {
    return res.status(400).json({
      status: "error",
      code: 400,
      message: "Bad request: `message` must be a non-empty string.",
    });
  }

  // Session cookie logic
  let sid = req.cookies.sid;
  if (!sid) {
    sid = randomUUID();
    res.cookie("sid", sid, {
      httpOnly: true,
      secure: false,    // set to true in production with HTTPS
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }

  // Retrieve or initialize conversation history
  const history = sessionStore.get(sid) || [];
  if (history.length === 0) {
    history.push({ role: 'system', content: prompt });
  }
  history.push({ role: 'user', content: userText });

  try {
    // Call the chat helper
    const { jsonData, messages: updatedMessages } = await chat(userText, history, sid);
    // Update session store
    sessionStore.set(sid, updatedMessages);

    // Determine product results based on intent
    let results = [];
    switch (jsonData['Intent Name']) {
      case 'ProductListAndSearch-CFT':
        results = allProducts();
        break;
      case 'FilteredProductListQuery':
        if (jsonData.sql_query) {
          results = FilteredProductListQueryFromSQL(jsonData.sql_query);
        } else {
          results = FilteredProductListQuery(
            jsonData.lookup,
            jsonData.lookupProductname,
            jsonData.lookupProductprice,
            jsonData.lookupProductpriceFrom,
            jsonData.lookupProductpriceTo
          );
        }
        break;
      case 'SearchProductByName':
        results = productsByNameLike(jsonData.lookup);
        break;
      case 'SpecificDetailsFromSKU':
      case 'CompleteDetailsFromSKU':
        results = productBySKU(jsonData.lookup);
        break;
      default:
        results = [];
    }

    // Build recommendations
    let recommended = [];
    if (Array.isArray(results) && results.length > 0) {
      const seed = results[0].tags?.split(',')[0] || jsonData.lookup;
      recommended = productsByCategory(seed, 4)
        .filter(p => !results.some(r => r.product_id === p.product_id))
        .slice(0, 4);
    }

    // Suggestions and answer text
    let suggestions = jsonData.suggestions || '';
    if (!results.length) {
      suggestions = suggestions || 'I couldn’t find that exact item – could you provide a bit more detail?';
    } else if (!suggestions) {
      suggestions = `Want to see more ${jsonData.lookup} or related tools?`;
    }

    const answer = jsonData.answer || (
      results.length
        ? `Here are the ${jsonData.lookup} I found 👇`
        : `Sorry, I couldn’t locate ${jsonData.lookup} in our catalogue.`
    );
    

 const intentName = jsonData["Intent Name"];
    const common = {
      intent: intentName,
      type:   jsonData.type,
      lookup: jsonData.lookup,
    };

    // Info-style intents only return `results` (string) + `suggestions`
    const infoIntents = ["CarbiInformation", "ExplainProduct", "GiveMoreInfo"];
    if (infoIntents.includes(intentName)) {
      return res.json({
        status: "success",
        data: {
          ...common,
          results:     jsonData.results,
          suggestions: jsonData.suggestions,
        }
      });
    }

    // Product-style intents return full catalog payload
    return res.json({
      status: "success",
      data: {
        ...common,
        answer,
        results,
        url:          jsonData.url || "",
        recommended,
        suggestions,
      }
    });

  } catch (err) {
    console.error("/bot error:", err);
    return res.status(502).json({
      status:  "error",
      code:    502,
      message: "Application failed to respond",
      details: err.message,
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});

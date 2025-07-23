import functions from "firebase-functions";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import Database from "better-sqlite3";
import fetch from "node-fetch"; // or use axios

import prompt from "./advprompt.js";
import {
  allProducts,
  productsByCategory,
  productsByNameLike,
  productBySKU,
  FilteredProductListQuery,
  FilteredProductListQueryFromSQL
} from "./productService.js";
import { defineSecret } from "firebase-functions/params";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { syncShopify } from "./fetchAndReplaceProducts.js";

// Load .env for local dev
dotenv.config();

// Toggle prod/local mode
export const IS_PROD = process.env.MY_KEY === 'production';
export let SECRET_KEY_SECRET;
export let SECRET_KEY;
let secretConfig = {};

if (IS_PROD) {
  SECRET_KEY_SECRET = defineSecret("MY_KEY");
  secretConfig.secrets = [SECRET_KEY_SECRET];
} else {
  SECRET_KEY = process.env.MY_KEY;
}

const app = express();
const PORT = 3300;
app.use(cookieParser());
app.use(cors());
app.use(bodyParser.json());

const sessionStore = new Map();

app.get("/", (req, res) => {
  res.send("success");
});

// Debug route (only runs locally)
if (process.env.NODE_ENV !== "production") {
  app.get("/bot/debug", (req, res) => {
    const sid = req.cookies.sid;
    if (!sid) {
      return res.status(400).json({ error: "No sid cookie present. Hit /session first." });
    }
    const history = sessionStore.get(sid) || [];
    res.json({ sid, turns: history.length, history });
  });
}

app.post("/bot", async (req, res) => {
  const userText = req.body?.message;
  if (typeof userText !== "string" || userText.trim().length === 0) {
    return res.status(400).json({
      status: "error",
      code: 400,
      message: "`message` must be a non-empty string.",
    });
  }

  let sid = req.cookies.sid;
  if (!sid) {
    sid = randomUUID();
    res.cookie("sid", sid, {
      httpOnly: true,
      secure: false, // set to true in production
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }

  const history = sessionStore.get(sid) || [];
  if (history.length === 0) {
    history.push({ role: "system", content: prompt });
  }
  history.push({ role: "user", content: userText });

  try {
    const { jsonData, messages: updatedMessages } = await chat(userText, history, sid);
    sessionStore.set(sid, updatedMessages);

    let results = [];
    let lastProductResults = sessionStore.get(sid + ':lastProductResults') || [];

    switch (jsonData["Intent Name"]) {
      case "ProductListAndSearch-CFT":
        results = allProducts();
        sessionStore.set(sid + ':lastProductResults', results);
        break;
      case "FilteredProductListQuery":
        results = jsonData.sql_query
          ? FilteredProductListQueryFromSQL(jsonData.sql_query)
          : FilteredProductListQuery(
              jsonData.lookup,
              jsonData.lookupProductname,
              jsonData.lookupProductprice,
              jsonData.lookupProductpriceFrom,
              jsonData.lookupProductpriceTo
            );
        sessionStore.set(sid + ':lastProductResults', results);
        break;
      case "SearchProductByName":
        results = productsByNameLike(jsonData.lookup);
        sessionStore.set(sid + ':lastProductResults', results);
        break;
      case "ProductDetailByIndex":
        const idx = parseInt(jsonData.lookup, 10) - 1;
        if (Array.isArray(lastProductResults) && lastProductResults.length > idx && idx >= 0) {
          results = [lastProductResults[idx]];
        }
        break;
      case "SpecificDetailsFromSKU":
      case "CompleteDetailsFromSKU":
        results = productBySKU(jsonData.lookup);
        break;
      case "Interaction":
        results = jsonData.results || [];
        break;
      default:
        results = [];
    }

    let recommended = [];
    if (Array.isArray(results) && results.length > 0) {
      const seed = results[0].tags?.split(",")[0] || jsonData.lookup;
      recommended = productsByCategory(seed, 4)
        .filter(p => !results.some(r => r.product_id === p.product_id))
        .slice(0, 4);
    }

    const intentName = jsonData["Intent Name"];
    const suggestions = jsonData.suggestions ||
      (results.length
        ? `Want to see more ${jsonData.lookup} or related tools?`
        : "I couldn’t find that exact item – could you provide a bit more detail?");

    const answer = jsonData.answer || (
      results.length
        ? `Here are the ${jsonData.lookup} I found 👇`
        : `Sorry, I couldn’t locate ${jsonData.lookup} in our catalogue.`
    );

    const common = {
      intent: intentName,
      type: jsonData.type,
      lookup: jsonData.lookup,
    };

    if (["CarbiInformation", "ExplainProduct", "GiveMoreInfo"].includes(intentName)) {
      return res.json({
        status: "success",
        data: {
          ...common,
          results: jsonData.results,
          suggestions,
        },
      });
    }

    return res.json({
      status: "success",
      data: {
        ...common,
        answer,
        results,
        url: jsonData.url || "",
        recommended,
        suggestions,
      },
    });

  } catch (err) {
    console.error("/bot error:", err);
    return res.status(502).json({
      status: "error",
      code: 502,
      message: "Application failed to respond",
      details: err.message,
    });
  }
});

app.get("/test-shopify", async (req, res) => {
  try {
    const products = await fetchAllShopifyProducts();
    res.json({
      status: "success",
      count: products.length,
      sample: products.slice(0, 3).map(p => ({ id: p.id, title: p.title }))
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

const openai = new OpenAI({
  apiKey: IS_PROD ? SECRET_KEY_SECRET.value() : SECRET_KEY,
});

async function chat(userText, messages, sid) {
  if (messages.length === 0 || messages[0].role !== "system") {
    messages.unshift({
      role: "system",
      content: prompt,
    });
  }

  messages.push({ role: "user", content: userText });

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-nano",
    messages,
    user: sid,
    response_format: { type: "json_object" },
  });

  const jsonData = JSON.parse(completion.choices[0].message.content.trim());
  messages.push({
    role: "assistant",
    content: completion.choices[0].message.content.trim(),
  });

  return { jsonData, messages };
}

export const api = functions.https.onRequest({
  ...secretConfig,
  memory: "512MiB",
  timeoutSeconds: 60,
}, app);


// (async () => {
//   await syncShopify();
// })();


export const hourlyShopifySync = onSchedule("every 60 minutes", async (event) => {
  await syncShopify();
});
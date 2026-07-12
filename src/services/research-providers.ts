/**
 * Multi-provider research + structuring abstraction.
 *
 * Research providers  → fetch web data about AI providers
 *   gemini   – Google Search grounding (single rich call, best quality)
 *   tavily   – Tavily Search API (multiple queries, aggregate snippets)
 *   exa      – Exa neural search
 *   firecrawl– Firecrawl search
 *   serper   – Serper (Google Search JSON API)
 *   perplexity – Perplexity chat completions with search
 *
 * Structure providers → extract JSON from research text
 *   gemini   – responseMimeType JSON (best, supports schema)
 *   openai   – chat completions with json_object mode
 */

import { GoogleGenAI, Type } from "@google/genai";
import { jsonrepair } from "jsonrepair";
import type { ResearchResult } from "./gemini-research";

// ─── Search queries for non-Gemini providers ──────────────────────────────────
export const SEARCH_QUERIES_WAVE1 = [
  "OpenAI Anthropic Google Gemini free API credits trial 2025",
  "Runway Pika Labs Luma AI Dream Machine free video credits 2025",
  "FLUX Ideogram Midjourney Stability AI free image generation credits 2025",
  "Groq Together AI Mistral Cohere Perplexity free API tier 2025",
  "Replicate Leonardo AI NightCafe Freepik free credits 2025",
  "Adobe Firefly Canva AI free generative credits 2025",
  "HeyGen D-ID Synthesia Hedra free video avatar credits 2025",
  "Cerebras SambaNova AI21 Labs Writer Inflection free inference 2025",
];

export const SEARCH_QUERIES_WAVE2 = [
  "Kling AI Hailuo MiniMax Seedance ByteDance free video credits 2025",
  "DeepSeek Moonshot Kimi Zhipu GLM free API credits 2025",
  "Baidu ERNIE Alibaba Qwen Tencent Hunyuan free AI credits",
  "Yandex Art GigaChat Sber Russian AI free tier 2025",
  "Mistral AI Aleph Alpha European AI free credits 2025",
  "PixVerse SeaArt Playground AI Craiyon free image generation 2025",
  "OctoAI Beam Modal Baseten free GPU compute credits 2025",
];

export const SEARCH_QUERIES_WAVE3 = [
  "Cursor Windsurf Copilot Codeium Tabnine free AI coding assistant credits 2025",
  "Framer AI Durable Wix ADI 10Web AI website builder free credits 2025",
  "Jasper Copy.ai Writesonic Rytr Longshot AI writing free trial 2025",
  "Gamma AI Tome Beautiful.ai SlidesAI presentation AI free credits 2025",
  "Notion AI Coda AI ClickUp AI Taskade productivity free tier 2025",
  "Fireflies Otter.ai Tldv Sembly meeting AI transcription free credits 2025",
  "Murf AI Play.ht Listnr Speechify AI voice free credits 2025",
  "Intercom AI Tidio Chatbase Voiceflow customer service AI free tier 2025",
  "Photoroom Remove.bg Clipdrop AI image editing free credits 2025",
  "Perplexity You.com Phind AI search engine free tier 2025",
  "Weavy Framia Durable AI powered SaaS tools free signup credits 2025",
  "AppSumo lifetime deal AI tools new free credits SaaS 2025",
];

// ─── Gemini research ──────────────────────────────────────────────────────────
export async function researchWithGemini(
  apiKey: string,
  prompt: string,
): Promise<string> {
  const genai = new GoogleGenAI({ apiKey });
  const response = await genai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { tools: [{ googleSearch: {} }], maxOutputTokens: 16384 },
  });
  return response.text ?? "";
}

// ─── Tavily research ──────────────────────────────────────────────────────────
export async function researchWithTavily(
  apiKey: string,
  queries: string[],
): Promise<string> {
  const results: string[] = [];
  for (const query of queries) {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "advanced",
        max_results: 10,
        include_answer: true,
      }),
    });
    if (!res.ok) throw new Error(`Tavily error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as {
      answer?: string;
      results?: { title?: string; url?: string; content?: string }[];
    };
    if (data.answer) results.push(`Query: ${query}\nAnswer: ${data.answer}`);
    if (data.results) {
      for (const r of data.results) {
        results.push(`Source: ${r.url}\nTitle: ${r.title}\n${r.content}`);
      }
    }
  }
  return results.join("\n\n---\n\n");
}

// ─── Exa research ─────────────────────────────────────────────────────────────
export async function researchWithExa(
  apiKey: string,
  queries: string[],
): Promise<string> {
  const results: string[] = [];
  for (const query of queries) {
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        query,
        num_results: 10,
        use_autoprompt: true,
        contents: { text: { max_characters: 1000 } },
      }),
    });
    if (!res.ok) throw new Error(`Exa error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as {
      results?: { title?: string; url?: string; text?: string }[];
    };
    for (const r of data.results ?? []) {
      results.push(`Source: ${r.url}\nTitle: ${r.title}\n${r.text ?? ""}`);
    }
  }
  return results.join("\n\n---\n\n");
}

// ─── Firecrawl research ───────────────────────────────────────────────────────
export async function researchWithFirecrawl(
  apiKey: string,
  queries: string[],
): Promise<string> {
  const results: string[] = [];
  for (const query of queries) {
    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query, limit: 8 }),
    });
    if (!res.ok) throw new Error(`Firecrawl error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as {
      data?: { title?: string; url?: string; markdown?: string; description?: string }[];
    };
    for (const r of data.data ?? []) {
      results.push(
        `Source: ${r.url}\nTitle: ${r.title}\n${r.description ?? ""}\n${r.markdown?.substring(0, 800) ?? ""}`,
      );
    }
  }
  return results.join("\n\n---\n\n");
}

// ─── Serper research ──────────────────────────────────────────────────────────
export async function researchWithSerper(
  apiKey: string,
  queries: string[],
): Promise<string> {
  const results: string[] = [];
  for (const query of queries) {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify({ q: query, num: 10 }),
    });
    if (!res.ok) throw new Error(`Serper error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as {
      answerBox?: { answer?: string };
      organic?: { title?: string; link?: string; snippet?: string }[];
    };
    if (data.answerBox?.answer) results.push(`Answer: ${data.answerBox.answer}`);
    for (const r of data.organic ?? []) {
      results.push(`Source: ${r.link}\nTitle: ${r.title}\n${r.snippet}`);
    }
  }
  return results.join("\n\n---\n\n");
}

// ─── Perplexity research ──────────────────────────────────────────────────────
export async function researchWithPerplexity(
  apiKey: string,
  queries: string[],
): Promise<string> {
  const results: string[] = [];
  for (const query of queries) {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-sonar-large-128k-online",
        messages: [
          {
            role: "user",
            content: `Research and list ALL AI providers related to this topic with their free credit details: ${query}. Include exact amounts, URLs, credit card requirements, and expiry.`,
          },
        ],
        max_tokens: 2048,
      }),
    });
    if (!res.ok) throw new Error(`Perplexity error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    if (content) results.push(`Query: ${query}\n${content}`);
  }
  return results.join("\n\n---\n\n");
}

// ─── Perplexity structuring ───────────────────────────────────────────────────
export async function structureWithPerplexity(
  apiKey: string,
  researchText: string,
  waveLabel: string,
): Promise<ResearchResult[]> {
  const prompt = `${STRUCTURE_SYSTEM_PROMPT}\n\n${STRUCTURE_SCHEMA_TEXT}\n\n=== ${waveLabel} ===\n${researchText}`;
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.1-sonar-large-128k-online",
      messages: [
        {
          role: "system",
          content: "You are a JSON extraction specialist. Output ONLY a raw JSON array with no markdown, no code fences, no explanation. The array contains provider objects.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 32768,
    }),
  });
  if (!res.ok) throw new Error(`Perplexity structuring error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content ?? "[]";
  return parseJsonSafe(text);
}

// ─── Structure schema (shared) ────────────────────────────────────────────────
export const STRUCTURE_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      name:                 { type: Type.STRING },
      website_url:          { type: Type.STRING },
      description:          { type: Type.STRING },
      free_credit_amount:   { type: Type.STRING },
      credit_type:          { type: Type.STRING },
      has_kling:            { type: Type.BOOLEAN },
      kling_detail:         { type: Type.STRING },
      category:             { type: Type.STRING },
      entity_type:          { type: Type.STRING },
      requires_credit_card: { type: Type.BOOLEAN },
      expiry_days:          { type: Type.NUMBER },
      status:               { type: Type.STRING },
      source_url:           { type: Type.STRING },
      notes:                { type: Type.STRING },
    },
    required: [
      "name", "website_url", "description", "has_kling",
      "category", "entity_type", "requires_credit_card", "status",
    ],
  },
};

const STRUCTURE_SYSTEM_PROMPT = `You are a data extraction specialist. Convert research text into a JSON array.

CRITICAL: You MUST classify every item with "entity_type":
- "ai_provider"  → actual AI tool/platform/API/app (Runway, OpenAI, Kling, Pika, etc.)
- "blog"         → blog post, Medium article, tutorial, Substack. Signals: /blog/, /article/, /post/, medium.com, substack.com, dev.to
- "video"        → YouTube video, Vimeo. URL contains: youtube.com, youtu.be, vimeo.com
- "social_media" → Facebook, Instagram, Twitter/X, LinkedIn, Reddit, TikTok, Discord
- "news"         → News article. Signals: forbes.com, techcrunch.com, theverge.com, venturebeat.com, wired.com
- "aggregator"   → AI tool directory, comparison site (theresanaiforthat.com, g2.com, capterra.com)
- "other"        → anything else

DECISION: Check the URL FIRST.
- youtube.com / youtu.be → video
- medium.com OR URL has /blog/ OR /article/ OR /post/ → blog
- facebook/instagram/twitter/x.com/linkedin/reddit/tiktok/discord → social_media
- News media domain → news
- Tool directory → aggregator
- Has its OWN AI service users sign up for → ai_provider

Rules:
- Extract ALL items including blogs and videos (classify correctly, do NOT skip them)
- Normalize category: ONLY "Video AI"|"Image AI"|"LLM"|"Multimodal"|"Audio AI"|"Other"
- Each entry must have a unique website_url
Output ONLY a raw JSON array, no markdown, no code fences, no explanation.`;

const STRUCTURE_SCHEMA_TEXT = `Each element MUST have ALL these fields:
{
  "name": string,
  "website_url": string (the exact URL from the source),
  "description": string (1-2 sentences),
  "free_credit_amount": string | null,
  "credit_type": string | null,
  "has_kling": boolean,
  "kling_detail": string | null,
  "category": "Video AI"|"Image AI"|"LLM"|"Multimodal"|"Audio AI"|"Other",
  "entity_type": "ai_provider"|"blog"|"video"|"social_media"|"news"|"aggregator"|"other",
  "requires_credit_card": boolean,
  "expiry_days": number | null,
  "status": "active"|"expired"|"unverified",
  "source_url": string | null,
  "notes": string | null
}`;

// ─── Gemini structuring ───────────────────────────────────────────────────────
export async function structureWithGemini(
  apiKey: string,
  researchText: string,
  waveLabel: string,
): Promise<ResearchResult[]> {
  const genai = new GoogleGenAI({ apiKey });
  const prompt = `${STRUCTURE_SYSTEM_PROMPT}\n\n${STRUCTURE_SCHEMA_TEXT}\n\n=== ${waveLabel} ===\n${researchText}`;
  const response = await genai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      maxOutputTokens: 65536,
    },
  });
  return parseJsonSafe(response.text ?? "");
}

// ─── Groq structuring ────────────────────────────────────────────────────────
export async function structureWithGroq(
  apiKey: string,
  researchText: string,
  waveLabel: string,
): Promise<ResearchResult[]> {
  const prompt = `${STRUCTURE_SYSTEM_PROMPT}\n\n${STRUCTURE_SCHEMA_TEXT}\n\n=== ${waveLabel} ===\n${researchText}`;
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Output a JSON object with a 'providers' array." },
        { role: "user", content: prompt },
      ],
      max_tokens: 6144,
    }),
  });
  if (!res.ok) throw new Error(`Groq structuring error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content ?? "[]";
  return parseJsonSafe(text);
}

// ─── OpenAI structuring ───────────────────────────────────────────────────────
export async function structureWithOpenAI(
  apiKey: string,
  researchText: string,
  waveLabel: string,
): Promise<ResearchResult[]> {
  const prompt = `${STRUCTURE_SYSTEM_PROMPT}\n\n${STRUCTURE_SCHEMA_TEXT}\n\n=== ${waveLabel} ===\n${researchText}`;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Output a JSON object with a 'providers' array." },
        { role: "user", content: prompt },
      ],
      max_tokens: 16384,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI structuring error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content ?? "[]";
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : (parsed.providers ?? []);
}

// ─── Entity type detector (URL-based, used by rule-based parser) ──────────────
function detectEntityType(url: string, title: string): string {
  const lUrl = url.toLowerCase();
  const lTitle = title.toLowerCase();

  // ── Video platforms ────────────────────────────────────────────────────────
  if (/youtube\.com|youtu\.be|vimeo\.com/.test(lUrl)) return "video";

  // ── Social media ───────────────────────────────────────────────────────────
  if (/facebook\.com|instagram\.com|twitter\.com|(?:^|\.)x\.com\/|linkedin\.com|reddit\.com|tiktok\.com|discord\.(com|gg)/.test(lUrl)) return "social_media";

  // ── Aggregator / comparison / app stores ──────────────────────────────────
  if (/theresanaiforthat\.com|futuretools\.io|topai\.tools|toolify\.ai|g2\.com|capterra\.com|sourceforge\.net|getapp\.com|trustradius\.com|aipricing\.guru|getaiperks\.com|play\.google\.com|apps\.apple\.com|alternativeto\.net|aitoptools\.com|insidr\.ai|opencode\.ai|getmodelkey\.com|layer3labs\.io/.test(lUrl)) return "aggregator";

  // ── Aggregator signals in URL path ─────────────────────────────────────────
  if (/\/alternatives?\/|\/compare\/|\/vs\/|\/top-\d+|\/best-\d+|\/deals\/|\/deal\/|\/discount|\/promo/.test(lUrl)) return "aggregator";

  // ── Blog signals in URL path ───────────────────────────────────────────────
  if (/\/blog\/|\/blogs\/|\/article\/|\/articles\/|\/post\/|\/posts\/|\/p\/[a-z0-9]|\/insights\/|\/newsletter\/|\/kb\/|\/guides?\/|\/tutorial|\/learn\//.test(lUrl)) return "blog";

  // ── Wiki / research papers / discussion forums ────────────────────────────
  if (/wikipedia\.org|arxiv\.org|arxiv\.com|scholar\.google|discuss\.|community\.|forum\.|helpx\.|support\./.test(lUrl)) return "blog";

  // ── Blog domains ───────────────────────────────────────────────────────────
  if (/medium\.com|substack\.com|dev\.to|hashnode\.(com|dev)|beehiiv\.com|ghost\.io|blogspot\.com|wordpress\.com|letters\.|mattk\.com|s4scoding\.com|noota\.io\/en\//.test(lUrl)) return "blog";

  // ── Blog-style subdomain ───────────────────────────────────────────────────
  if (/^https?:\/\/blog\./.test(lUrl) || /^https?:\/\/letters\./.test(lUrl) || /^https?:\/\/pub\./.test(lUrl)) return "blog";

  // ── News outlets ───────────────────────────────────────────────────────────
  if (/forbes\.com|techcrunch\.com|theverge\.com|venturebeat\.com|wired\.com|zdnet\.com|cnet\.com|gizmodo\.com|sputniknews|martechseries|analyticsvidhya|towardsdatascience|c-sharpcorner\.com|altairmedia|tech-insider\.org|aijourn\.com|tech360\.tv|gccbusinessnews\.com|freelance-stack\.io/.test(lUrl)) return "news";

  // ── Blog-like titles (last resort) ────────────────────────────────────────
  const blogTitlePatterns = [
    /^\d+\s+best\b/i, /^\d+\s+top\b/i, /^best\s+\w+\s+(?:tools?|apps?|alternatives?)/i,
    /\bvs\.?\s+\w/i, /\bcompar(?:e|ing|ison)\b/i, /\breview\b/i,
    /\bhow\s+to\b/i, /\bguide\s+to\b/i, /\bcomplete\s+guide\b/i,
    /\btop\s+\d+\b/i, /\bultimate\s+list\b/i, /\bcheat\s+sheet\b/i,
    /\balternatives?\b/i, /\bbest\s+\w+\s+for\b/i,
  ];
  if (blogTitlePatterns.some((p) => p.test(lTitle))) return "blog";

  return "ai_provider";
}

// ─── Rule-based fallback extractor ───────────────────────────────────────────
// Used as last resort when ALL LLM structure providers are unavailable.
// Parses Tavily/Serper/Exa research text format directly without an LLM.
export function structureWithRuleBased(researchText: string): ResearchResult[] {
  const results: ResearchResult[] = [];
  const seenDomains = new Set<string>();

  // Match source blocks from Tavily / Serper / Exa format
  const sourceRegex = /Source:\s*(https?:\/\/[^\n\s]+)[\s\S]*?Title:\s*([^\n]+)\n([\s\S]*?)(?=\n---\n|Source:\s*https?:\/\/|$)/g;

  let match: RegExpExecArray | null;
  while ((match = sourceRegex.exec(researchText)) !== null) {
    const [, rawUrl, rawTitle, rawContent] = match;
    const url = rawUrl.trim();
    let domain: string;
    try {
      domain = new URL(url).hostname.replace(/^www\./, "").replace(/^api\./, "");
    } catch {
      continue;
    }
    if (seenDomains.has(domain)) continue;
    seenDomains.add(domain);

    const combined = `${rawTitle} ${rawContent}`;

    // ── Entity type ──────────────────────────────────────────────────────────
    const entityType = detectEntityType(url, rawTitle);

    // ── Free credit amount ───────────────────────────────────────────────────
    let freeCreditAmount: string | null = null;
    let creditType: string | null = null;

    const usdMatch = /\$\s*(\d+(?:\.\d+)?)(?:\s*(?:USD|free|credit|trial|in\s+credit))?/i.exec(combined);
    if (usdMatch) { freeCreditAmount = `${usdMatch[1]}`; creditType = "USD"; }

    if (!freeCreditAmount) {
      const unitMatch = /(\d[\d,.]*)\s*(tokens?|credits?|generations?|images?|videos?|API\s+calls?)/i.exec(combined);
      if (unitMatch) {
        freeCreditAmount = `${unitMatch[1]} ${unitMatch[2]}`;
        creditType = unitMatch[2].toLowerCase().replace(/s$/, "");
      }
    }

    // ── Category ─────────────────────────────────────────────────────────────
    let category = "Other";
    if (/\b(video|film|clip|motion\s+control|animation|sora|runway|pika|luma|kling|hailuo|seedance|vidu|wan\.video)\b/i.test(combined)) {
      category = "Video AI";
    } else if (/\b(image|photo|dall.?e|stable.?diffusion|flux|midjourney|ideogram|firefly)\b/i.test(combined)) {
      category = "Image AI";
    } else if (/\b(language\s+model|llm|gpt|claude|gemini|chat\s+completion|inference|api\s+credits?)\b/i.test(combined)) {
      category = "LLM";
    } else if (/\b(multimodal|vision\s+model|multi.?modal)\b/i.test(combined)) {
      category = "Multimodal";
    } else if (/\b(audio|voice|speech|tts|text.?to.?speech|music|sound\s+fx)\b/i.test(combined)) {
      category = "Audio AI";
    }

    // ── Status ───────────────────────────────────────────────────────────────
    let status: "active" | "expired" | "unverified" = "unverified";
    if (/\b(free\s+tier|free\s+credit|free\s+trial|no\s+cost|gratis|available\s+now)\b/i.test(combined)) {
      status = "active";
    }
    if (/\b(expired?|discontinued|no\s+longer\s+(?:free|available)|ended|removed)\b/i.test(combined)) {
      status = "expired";
    }

    // ── Kling ────────────────────────────────────────────────────────────────
    const hasKling = /\bkling\b/i.test(combined);

    // ── Requires CC ──────────────────────────────────────────────────────────
    const requiresCC =
      /\b(credit\s+card\s+required|requires?\s+credit\s+card|billing\s+required)\b/i.test(combined) &&
      !/\bno\s+credit\s+card\b/i.test(combined);

    // ── Provider name: first segment of title before | - — ───────────────────
    const name = rawTitle
      .split(/[|\-–—]/)[0]
      .replace(/\s*(free|api|credits?|trial|sign\s*up|pricing)\s*/gi, "")
      .trim()
      .substring(0, 100) || domain;

    results.push({
      name,
      website_url: url,
      description: rawContent.replace(/\n/g, " ").trim().substring(0, 300) || rawTitle,
      free_credit_amount: freeCreditAmount,
      credit_type: creditType,
      has_kling: hasKling,
      kling_detail: hasKling ? "Supports Kling-style video generation (rule-based detection)" : null,
      category,
      entity_type: entityType,
      requires_credit_card: requiresCC,
      expiry_days: null,
      status,
      source_url: url,
      notes: "Extracted by rule-based parser (LLM structure providers unavailable)",
    });
  }

  // Also try to parse Perplexity / Exa format: "Query: ...\n[answer text]"
  const answerRegex = /Query:\s*([^\n]+)\nAnswer:\s*([\s\S]*?)(?=\n---\n|Query:|$)/g;
  while ((match = answerRegex.exec(researchText)) !== null) {
    const [, , answer] = match;
    const providerPattern = /([A-Z][a-zA-Z0-9._ ]{2,40}?)\s+offers?\s+(?:up\s+to\s+)?\$(\d+(?:\.\d+)?)/g;
    let pm: RegExpExecArray | null;
    while ((pm = providerPattern.exec(answer)) !== null) {
      const [, rawName, amount] = pm;
      const name = rawName.trim();
      if (results.some((r) => r.name.toLowerCase() === name.toLowerCase())) continue;
      const guessedUrl = `https://www.${name.toLowerCase().replace(/\s+/g, "")}.com`;
      results.push({
        name,
        website_url: guessedUrl,
        description: `${name} offers free credits (extracted from research summary).`,
        free_credit_amount: `${amount}`,
        credit_type: "USD",
        has_kling: false,
        kling_detail: null,
        category: "Other",
        entity_type: "ai_provider",
        requires_credit_card: false,
        expiry_days: null,
        status: "unverified",
        source_url: null,
        notes: "Extracted by rule-based parser from answer summary",
      });
    }
  }

  return results;
}

// ─── JSON parse helper ────────────────────────────────────────────────────────
export function parseJsonSafe(text: string): ResearchResult[] {
  try {
    const parsed = JSON.parse(text.trim());
    return Array.isArray(parsed) ? parsed : (parsed.providers ?? []);
  } catch {
    const repaired = jsonrepair(text.trim());
    const parsed = JSON.parse(repaired);
    return Array.isArray(parsed) ? parsed : (parsed.providers ?? []);
  }
}

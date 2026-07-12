import { GoogleGenAI, Type } from "@google/genai";
import { jsonrepair } from "jsonrepair";
import { db } from "../db";
import { providersTable, researchJobsTable, apiKeysTable } from "../db";
import { eq, sql, and } from "drizzle-orm";
import { logger } from "../lib/logger";
import {
  researchWithTavily, researchWithExa, researchWithFirecrawl,
  researchWithSerper, researchWithPerplexity,
  structureWithGemini, structureWithOpenAI, structureWithGroq, structureWithPerplexity,
  structureWithRuleBased,
  SEARCH_QUERIES_WAVE1, SEARCH_QUERIES_WAVE2, SEARCH_QUERIES_WAVE3,
} from "./research-providers";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isTransient = (err: unknown) => {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return msg.includes("503") || msg.includes("high demand") || msg.includes("temporarily") || msg.includes("overload");
};

// ─── Key helpers ─────────────────────────────────────────────────────────────

interface ProviderKey {
  provider: string;
  apiKey: string;
  label: string;
  isActive: boolean;
}

/**
 * Returns ALL stored keys for a provider, active-first then by createdAt.
 * Never throws — returns [] if table missing or DB down.
 */
async function getAllKeysForProvider(provider: string): Promise<ProviderKey[]> {
  try {
    const rows = await db
      .select()
      .from(apiKeysTable)
      .where(eq(apiKeysTable.provider, provider))
      .orderBy(apiKeysTable.isActive, apiKeysTable.createdAt);
    // orderBy isActive DESC would require desc(), so sort in JS:
    return rows
      .sort((a, b) => (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0))
      .map((r) => ({
        provider: r.provider,
        apiKey: r.apiKey,
        label: r.label,
        isActive: r.isActive,
      }));
  } catch {
    return [];
  }
}

/** Returns the active Gemini key from the database (set via API Keys menu). */
async function getGeminiKey(): Promise<string> {
  const rows = await getAllKeysForProvider("gemini");
  const active = rows.find((r) => r.isActive);
  if (active) return active.apiKey;
  throw new Error(
    "No Gemini API key configured. Tambahkan Gemini API key di menu API Keys dan aktifkan.",
  );
}

async function getGenAI(): Promise<GoogleGenAI> {
  const key = await getGeminiKey();
  return new GoogleGenAI({ apiKey: key });
}

// ─── Research prompts ─────────────────────────────────────────────────────────
// Wave 1: Western + mainstream global AI providers
const RESEARCH_PROMPT_WAVE1 = `
You are a research analyst. Use Google Search to find the MOST CURRENT (2024–2025) information about FREE credits and free trial offers from AI providers worldwide.

Search extensively for ALL of the following providers. For EACH one, find:
- Official website URL
- Exact free credit amount (e.g. "$10 USD", "1000 tokens", "500 images", "100 API calls")
- Credit type (USD, tokens, credits, images, videos, generations, API calls, etc.)
- Whether a credit card is required to claim free credits
- How many days the free credits last (if known)
- Category: Video AI, Image AI, LLM, Multimodal, Audio AI, or Other
- Whether they support Kling AI motion control / video generation features
- If Kling-enabled, what specific Kling features/credits are offered
- Current status of the offer: active, expired, or unverified
- Source URL where you found this information

WESTERN & MAINSTREAM PROVIDERS TO RESEARCH (search each one):
1. OpenAI (platform.openai.com) - GPT-4o, DALL-E 3, Sora API credits
2. Anthropic (console.anthropic.com) - Claude 4 Sonnet free tier
3. Google AI Studio (aistudio.google.com) - Gemini 2.5 Flash/Pro free tier
4. Google Vertex AI (cloud.google.com) - Veo 3, Imagen free trial credits
5. Runway ML (runwayml.com) - Gen-4 Turbo free credits
6. Pika Labs (pika.art) - Pika 2.2 free credits
7. Luma AI (lumalabs.ai) - Dream Machine free generations
8. Stability AI (stability.ai) - Stable Diffusion 3.5 free credits
9. Black Forest Labs / FLUX (fal.ai/models/fal-ai/flux-pro) - FLUX.1 free credits via fal.ai
10. Ideogram (ideogram.ai) - Ideogram 3.0 free daily generations
11. Midjourney (midjourney.com) - free trial status 2025
12. Adobe Firefly (firefly.adobe.com) - free generative credits
13. Freepik AI (freepik.com/ai) - free AI image generations
14. Canva AI (canva.com) - free AI features and credits
15. Leonardo AI (leonardo.ai) - free daily tokens
16. NightCafe (nightcafe.studio) - free daily credits
17. Groq (console.groq.com) - free API tier
18. Together AI (api.together.ai) - free $1 credits
19. Mistral AI (console.mistral.ai) - free tier / La Plateforme
20. Cohere (dashboard.cohere.com) - free trial API
21. Replicate (replicate.com) - free compute credits
22. Perplexity AI (perplexity.ai) - free tier / API credits
23. ElevenLabs (elevenlabs.io) - free TTS credits monthly
24. Suno (suno.com) - free music generations daily
25. Udio (udio.com) - free song credits monthly
26. Hugging Face (huggingface.co) - free inference API
27. Fal.ai (fal.ai) - free inference credits
28. Fireworks AI (fireworks.ai) - free API credits
29. xAI / Grok API (x.ai) - free API tier credits
30. Character AI (character.ai) - free usage
31. Poe by Quora (poe.com) - free message credits
32. You.com (you.com) - free AI search/generation
33. Vercel AI SDK (sdk.vercel.ai) - free usage with partner models
34. Cloudflare Workers AI (cloudflare.com/workers-ai) - free tier
35. Haiper AI (haiper.ai) - free video generations
36. PixVerse (pixverse.ai) - free video generation credits
37. Viggle AI (viggle.ai) - free video generations
38. Kaiber AI (kaiber.ai) - free trial credits
39. InVideo AI (invideo.ai) - free plan credits
40. Morph Studio (morphstudio.com) - free generations
41. Genmo AI (genmo.ai) - free video credits
42. CivitAI (civitai.com) - free image generations
43. Tensor.art (tensor.art) - free image generations
44. Magnific AI (magnific.ai) - free upscales
45. Dream Machine / Luma Ray2 (lumalabs.ai) - separate credits for Ray2
46. Lightricks LTX Video (ltx.studio) - free video credits
47. Hedra (hedra.com) - free video generation credits
48. Captions AI (captions.ai) - free AI video features
49. Descript (descript.com) - free plan with AI features
50. Speechify (speechify.com) - free TTS credits

Provide a COMPREHENSIVE detailed summary for ALL providers found. Include any NEW providers you discover during your search that offer free credits in 2024-2025.`;

// Wave 2: Asian, Russian, European, and new emerging providers
const RESEARCH_PROMPT_WAVE2 = `
You are a research analyst specializing in the GLOBAL AI market outside mainstream Western providers. Use Google Search extensively to find FREE credit offers from AI providers in China, Russia, Korea, Japan, India, Europe, and new startups worldwide.

Focus especially on finding providers that are "burning money" — offering extremely generous free tiers to gain market share in 2024-2025. These are often newer companies aggressively competing.

For EACH provider, find:
- Official website URL (include Chinese/non-English URLs)
- Exact free credit amount
- Credit type
- Whether credit card is required
- Days until expiry
- Category: Video AI, Image AI, LLM, Multimodal, Audio AI, or Other
- Whether it supports Kling-style motion control / video generation
- Current status: active, expired, or unverified

CHINESE AI PROVIDERS (search Baidu, search with Chinese terms if needed):
1. Kling AI / Kuaishou (klingai.com, kling.kuaishou.com) - motion control video leader
2. Hailuo AI / MiniMax (hailuoai.video, minimax.io) - video generation
3. Seedance / Jianying (capcut.com, ieslab.bytedance.com) - ByteDance video AI
4. Jimeng AI / 即梦 (jimeng.jianying.com) - ByteDance image+video
5. Vidu AI (vidu.studio, vidu.cn) - Shengshu Technology video AI
6. CogVideo / CogVideoX (zhipuai.cn, bigmodel.cn) - Zhipu AI video
7. Wan AI / 万象 (wan.video) - Alibaba/Wan video generation
8. PixVerse (pixverse.ai) - Chinese video AI
9. Baidu ERNIE Bot (yiyan.baidu.com, qianfan.cloud.baidu.com) - Baidu LLM
10. Alibaba Tongyi Qianwen / Qwen (tongyi.aliyun.com, dashscope.aliyun.com) - free API credits
11. Tencent Hunyuan (hunyuan.tencent.com) - LLM + multimodal
12. Tencent Yuanbao (yuanbao.tencent.com) - Tencent AI assistant
13. DeepSeek (deepseek.com, platform.deepseek.com) - very cheap/free API
14. Moonshot AI / Kimi (kimi.moonshot.cn, platform.moonshot.cn) - free API credits
15. Zhipu AI / GLM-4 (zhipuai.cn, bigmodel.cn) - free API tokens
16. 01.AI / Yi (01.ai, platform.01.ai) - free API credits
17. StepFun / 阶跃星辰 (stepfun.com) - multimodal free tier
18. Baichuan AI (baichuan-ai.com) - LLM free credits
19. ByteDance Doubao / 豆包 (doubao.com) - ByteDance LLM free tier
20. Minimax (minimax.chat, api.minimax.io) - API free credits
21. Shengshu AI (shengshu-ai.com) - video generation
22. Moki (moki.ai) - Chinese video AI
23. Nijijourney (nijijourney.com) - anime image generation
24. Wujie AI / 无界AI (wujieai.com) - Chinese image generation
25. SeaArt (seaart.ai) - image generation with free credits
26. LiblibAI (liblib.ai) - Chinese Stable Diffusion platform

RUSSIAN PROVIDERS:
27. Yandex Art / YandexGPT (ya.ru, yandex.cloud) - Yandex AI free tier
28. Sber AI / GigaChat (developers.sber.ru, gigachat.sber.ru) - free API credits
29. MTS AI (mts.ai) - Russian AI platform

KOREAN PROVIDERS:
30. Naver CLOVA (clova.ai, clovastudio.naver.com) - LLM + image
31. Kakao AI (kakao.com/ai) - Korean AI models
32. LG AI Research (lgresearch.ai) - EXAONE model
33. KT AI (kt.com/ai) - Korean telecom AI
34. Hyperclova X (hyper.clova.ai) - Naver's large language model

JAPANESE PROVIDERS:
35. Rinna (rinna.co.jp) - Japanese LLM
36. Sakana AI (sakana.ai) - Japanese AI startup
37. Preferred Networks (preferred.jp) - Japanese AI
38. NTT Communications AI (ntt.com) - Japanese AI platform
39. Sony AI (sony.com/ai) - AI research

EUROPEAN PROVIDERS:
40. Mistral AI (mistral.ai) - French LLM, free La Plateforme credits
41. Stability AI EU (stability.ai) - European servers
42. Aleph Alpha (aleph-alpha.com) - German LLM, free credits
43. BLOOM / BigScience (huggingface.co/bigscience) - open French model
44. Luminous by Aleph Alpha - German enterprise LLM
45. Mistral 7B free on multiple platforms

INDIAN PROVIDERS:
46. Krutrim AI (olakrutrim.com) - Ola's Indian LLM
47. Sarvam AI (sarvam.ai) - Indian language model
48. Gnani AI (gnani.ai) - Indian speech AI

NEW STARTUPS / "MONEY BURNING" FREE TIERS (search for generous free AI credits 2025):
49. Hedra (hedra.com) - talking avatar video generation
50. HeyGen (heygen.com) - AI video avatars, free tier
51. D-ID (d-id.com) - talking AI video, free credits
52. Synthesia (synthesia.io) - AI video, free plan
53. Fliki (fliki.ai) - text to video, free credits
54. Pictory (pictory.ai) - AI video, free trial
55. Steve AI (steve.ai) - AI video creation free tier
56. Hour One (hourone.ai) - AI video presenter
57. Wondershare Virbo (virbo.wondershare.com) - AI avatar video free credits
58. Colossyan (colossyan.com) - AI video creation
59. Elai (elai.io) - AI video presentation tool
60. Rask AI (rask.ai) - video localization, free credits
61. Typeframes (typeframes.com) - AI video free tier
62. Glif (glif.app) - AI image workflows, free usage
63. Flux free alternatives on Replicate - various free models
64. Playground AI (playground.com) - free image generation
65. Stockimg AI (stockimg.ai) - free AI stock images
66. Fotor AI (fotor.com) - free AI image editing
67. Photosonic / Writesonic (writesonic.com) - AI image generation
68. StarryAI (starryai.com) - free AI art credits
69. Dream by WOMBO (dream.ai) - free AI art
70. Craiyon (craiyon.com) - free AI image generation
71. Stablecog (stablecog.com) - free Stable Diffusion credits
72. SeaArt AI (seaart.ai) - very generous free image generation
73. Getimg.ai (getimg.ai) - free image generation credits
74. Hotpot AI (hotpot.ai) - free AI image credits
75. Mage Space (mage.space) - free Stable Diffusion
76. PicFinder (picfinder.ai) - free AI image search/generation
77. Prodia (prodia.com) - free fast Stable Diffusion API
78. OctoAI (octoai.cloud) - free compute credits
79. Beam.cloud (beam.cloud) - free GPU compute
80. Baseten (baseten.co) - free inference credits
81. Modal (modal.com) - free compute credits
82. Lepton AI (lepton.ai) - free inference
83. Cerebras (cerebras.ai) - very fast inference, free tier
84. SambaNova (sambanova.ai) - free API tier with fast inference
85. Databricks (databricks.com) - free DBRX model credits
86. AI21 Labs (ai21.com) - free Jamba API credits
87. Cohere Command R+ (cohere.com) - free trial
88. Upstage (upstage.ai) - Korean AI startup, Solar LLM
89. Writer.com (writer.com) - free Palmyra LLM
90. Inflection AI (inflection.ai) - Pi AI free usage

Be VERY thorough — search for each provider individually. Note any brand new providers you discover that are offering very generous free credits to burn through their funding.`;

// Wave 3: End-user SaaS AI tools & applications
const RESEARCH_PROMPT_WAVE3 = `
You are a research analyst. Use Google Search to find FREE credits, free tiers, and trial offers from AI-powered SaaS end-user tools and applications in 2024-2025. Focus on tools that regular users and businesses sign up for directly (not API-only services).

For EACH tool, find:
- Official website URL
- Exact free credit/trial amount
- Credit type and what you can do with it
- Whether credit card is required to sign up
- How long the free tier lasts
- Category: Video AI, Image AI, LLM, Multimodal, Audio AI, or Other
- Current status: active, expired, unverified

AI CODING ASSISTANTS:
1. Cursor AI (cursor.com) - AI code editor, free tier
2. Windsurf by Codeium (codeium.com, windsurf.ai) - free AI coding
3. GitHub Copilot (github.com/copilot) - free for students/OSS
4. Codeium (codeium.com) - free AI autocomplete
5. Tabnine (tabnine.com) - free AI code completion
6. Amazon CodeWhisperer (aws.amazon.com/codewhisperer) - free tier
7. Replit Ghostwriter (replit.com) - AI coding assistant
8. Sourcegraph Cody (sourcegraph.com/cody) - free AI code assistant

AI WEBSITE/APP BUILDERS:
9. Framer AI (framer.com) - AI website builder
10. Durable AI (durable.co) - AI website builder, free trial
11. Wix ADI (wix.com) - AI design intelligence
12. 10Web (10web.io) - AI WordPress builder
13. Hostinger Horizons (hostinger.com) - AI website builder

AI WRITING/CONTENT:
14. Jasper AI (jasper.ai) - AI writing, free trial
15. Copy.ai (copy.ai) - AI copywriting, free plan
16. Writesonic (writesonic.com) - free credits
17. Rytr (rytr.me) - free AI writing
18. Longshot AI (longshot.ai) - free trial
19. Simplified (simplified.com) - AI content, free plan

AI PRESENTATIONS:
20. Gamma AI (gamma.app) - AI presentations, free plan
21. Tome (tome.app) - AI storytelling, free credits
22. Beautiful.ai (beautiful.ai) - AI presentations
23. SlidesAI (slidesai.io) - free generations

AI PRODUCTIVITY:
24. Notion AI (notion.so) - AI features, free trial
25. Coda AI (coda.io) - AI docs, free plan
26. ClickUp AI (clickup.com) - AI in project management
27. Taskade (taskade.com) - AI workspace, free plan
28. Mem.ai (mem.ai) - AI note-taking

AI MEETING & TRANSCRIPTION:
29. Fireflies.ai (fireflies.ai) - free meeting notes
30. Otter.ai (otter.ai) - free transcription credits
31. Tldv (tldv.io) - free meeting recorder
32. Sembly (sembly.ai) - AI meeting assistant

AI VOICE & TTS:
33. Murf AI (murf.ai) - free TTS credits
34. Play.ht (play.ht) - AI voice, free tier
35. Listnr (listnr.com) - free TTS credits
36. Speechify (speechify.com) - free tier

AI IMAGE EDITING:
37. Photoroom (photoroom.com) - free AI background removal
38. Remove.bg (remove.bg) - free image credits
39. Clipdrop by Stability AI (clipdrop.co) - free AI tools

AI SEO/MARKETING:
40. Surfer SEO (surferseo.com) - AI content optimization
41. MarketMuse (marketmuse.com) - AI content strategy
42. Frase.io (frase.io) - AI content, free trial

AI CUSTOMER SERVICE:
43. Tidio (tidio.com) - AI chatbot, free plan
44. Chatbase (chatbase.co) - free chatbot builder
45. Voiceflow (voiceflow.com) - free AI conversation design

AI SEARCH:
46. Perplexity AI (perplexity.ai) - free AI search
47. You.com (you.com) - free AI search
48. Phind (phind.com) - free AI developer search

OTHER TOOLS:
49. Weavy (weavy.com) - AI collaboration platform, free tier
50. Framia (framia.ai or framia.com) - AI platform
51. Any new AI-powered SaaS tools launching in 2025 with free credits

Provide a COMPREHENSIVE summary for ALL tools found, including small/new ones.`;

// ─── Code research prompts (3 targeted waves) ────────────────────────────────

/**
 * Wave A: Dedicated coupon/deal aggregator sites that specifically track AI promo codes.
 * Gemini will use Google Search grounding to directly fetch these pages.
 */
const CODE_PROMPT_COUPON_SITES = `
You are an expert deal hunter. Use Google Search to visit and extract promo codes from DEDICATED COUPON & DEAL AGGREGATOR websites. These sites specifically collect and verify coupon codes.

VISIT EACH OF THESE SITES AND SEARCH FOR AI TOOL PROMO CODES ON THEM:
- hotdeals.com — search "AI tool coupon", "AI software discount", check their AI/software section
- simplycodes.com — look for OpenAI, ElevenLabs, Midjourney, Runway, Leonardo AI, HeyGen, Suno etc.
- couponbirds.com — AI platform coupons section
- dealspotr.com — search AI software deals and promo codes
- savecode.net — look for AI platform discount codes
- couponfollow.com — AI tools section
- offers.com — AI software deals
- knoji.com — AI service coupon codes
- promocodeland.com — AI tools
- coupert.com — scan for AI platform coupons
- slickdeals.net — search "AI promo code", "ChatGPT discount", "Midjourney coupon"
- retailmenot.com — search for ElevenLabs, Leonardo AI, HeyGen, Jasper AI coupon codes
- groupon.com — AI software deals
- dealmoon.com — AI software coupons (also Chinese market AI tools)
- AppSumo.com — lifetime deals for AI tools (search current active deals)
- dealfuel.com — AI tool lifetime deals and coupons
- stacksocial.com — AI software bundles and discount codes
- getcouponhere.com — AI tools
- couponx.com — AI software promo codes

USE GOOGLE SEARCH with these specific queries to find pages with codes:
- site:simplycodes.com AI OR "artificial intelligence"
- site:hotdeals.com AI tool promo code 2025
- site:couponbirds.com AI software coupon
- site:dealspotr.com AI discount code 2025
- "ElevenLabs promo code" site:simplycodes.com OR site:couponbirds.com OR site:retailmenot.com
- "Leonardo AI coupon" site:simplycodes.com OR site:dealspotr.com
- "Midjourney promo code 2025" site:simplycodes.com OR site:couponbirds.com
- "Runway ML discount code" coupon site
- "HeyGen promo code" coupon OR discount
- "Suno promo code" coupon 2025
- "Jasper AI coupon code" site:retailmenot.com OR site:couponbirds.com
- "Copy.ai promo code" site:simplycodes.com OR site:dealspotr.com
- "Cursor AI coupon" discount code 2025
- "Synthesia promo code" discount coupon
- "Descript coupon code" promo
- "Perplexity AI promo code" discount
- "InVideo AI coupon" promo code
- "NightCafe coupon code" discount
- "Pika Labs promo code" discount
- "Kling AI coupon" promo code
- "Stability AI coupon code" promo
- AI tool promo code hotdeals.com 2025
- AI software coupon dealspotr.com 2025

For EACH code found, report:
- Exact provider/platform name
- The EXACT code string (e.g. "SAVE20", "REDDIT15", "WELCOME10")
- What discount it provides
- Discount type: percentage / free_credits / free_trial / fixed_amount / other
- Source URL where found
- Source name (HotDeals, SimplyCodes, etc.)
- Expiry date if mentioned
- Status: "active" if the page shows it works, "unverified" if uncertain

Only report ACTUAL CODE STRINGS that can be entered at checkout — not generic "sign up for free" offers.
List every code found, no matter how small.
`;

/**
 * Wave B: Reddit, Discord, Twitter/X, and YouTube creator affiliate codes.
 */
const CODE_PROMPT_COMMUNITY = `
You are a community deal hunter. Use Google Search to find PROMO CODES shared by real users and creators in communities, social media, and YouTube.

SEARCH THESE COMMUNITY SOURCES for AI tool promo codes:

REDDIT (search each subreddit):
- Search: site:reddit.com "promo code" OR "discount code" OR "coupon" AI tool 2025
- site:reddit.com/r/ChatGPT "promo code"
- site:reddit.com/r/artificial "discount code" AI
- site:reddit.com/r/StableDiffusion "promo code" OR "coupon"
- site:reddit.com/r/midjourney "discount" OR "promo code"
- site:reddit.com/r/AItools "promo code" OR "coupon"
- site:reddit.com/r/singularity "promo code" coupon AI
- site:reddit.com/r/LocalLLaMA "discount code" OR "free credits"
- site:reddit.com/r/MachineLearning "promo code"
- reddit.com r/videosynthesis "promo code" OR "coupon"

YOUTUBE CREATOR AFFILIATE CODES (search for creator codes):
- YouTube creators with AI affiliate promo codes 2025
- "use code [CREATORNAME]" ElevenLabs OR Midjourney OR Leonardo AI
- ElevenLabs affiliate promo code YouTube creator 2025
- "Leonardo AI promo code" YouTube creator discount
- "Suno AI discount code" YouTube 2025
- "HeyGen discount" YouTube creator affiliate code
- "Runway ML promo code" YouTube influencer 2025
- AI tool YouTube affiliate code discount 2025

TWITTER/X:
- site:x.com "promo code" AI tool 2025
- site:twitter.com "discount code" AI platform
- site:x.com ElevenLabs OR Midjourney OR "Leonardo AI" promo code

DISCORD:
- "promo code" AI tool discord 2025
- Discord server AI deals promo code

PRODUCT HUNT:
- site:producthunt.com "promo code" OR "discount" AI tool 2025

ALSO SEARCH THESE SPECIFIC PROVIDERS on all community platforms:
- "ElevenLabs promo code" Reddit YouTube Twitter 2025
- "Midjourney discount code" community 2025
- "Leonardo AI coupon" Reddit 2025
- "HeyGen promo" Reddit 2025
- "Suno AI code" Reddit YouTube 2025
- "Udio promo code" community
- "Copy.ai discount code" Reddit 2025
- "Jasper AI coupon" Reddit community
- "Synthesia promo code" Reddit
- "Descript coupon code" Reddit YouTube
- "Canva promo code" AI features 2025
- "NightCafe coupon" Reddit community
- "Cursor AI promo code" Reddit YouTube
- "Perplexity AI coupon" Reddit 2025

Report every actual code string you find, with the source URL.
`;

/**
 * Wave C: Official AI provider affiliate pages, newsletters, and tech deal blogs.
 */
const CODE_PROMPT_OFFICIAL = `
You are a deal researcher. Use Google Search to find promo codes from OFFICIAL AI PROVIDER PAGES, AFFILIATE PROGRAMS, TECH NEWSLETTERS, and DEAL BLOGS.

OFFICIAL PROVIDER PAGES — search each provider for their own promo/affiliate codes:
- ElevenLabs official promotions, affiliate codes, partner discounts: elevenlabs.io/pricing coupon
- Leonardo AI official promo codes: leonardo.ai/pricing affiliate code
- HeyGen official discount codes and partner codes: heygen.com promo
- Suno AI official promo page: suno.com promo code affiliate
- Udio official discounts: udio.com coupon
- Runway ML official partner codes: runwayml.com promo affiliate
- Pika Labs official promotions: pika.art promo
- NightCafe official referral and promo codes: nightcafe.studio coupon promo
- Midjourney official promotions (any active 2025 codes)
- Jasper AI official coupon: jasper.ai promo affiliate
- Copy.ai official discount: copy.ai coupon affiliate code
- Writesonic official promo: writesonic.com coupon code
- Descript official coupon: descript.com promo
- InVideo AI official promo: invideo.ai coupon
- Synthesia official partner promo codes: synthesia.io discount
- Murf AI official coupon: murf.ai promo code
- Pictory AI official promo: pictory.ai coupon
- Luma AI official promotions: lumalabs.ai promo
- Cursor AI official promo: cursor.com coupon
- Perplexity AI official promotions: perplexity.ai promo code
- Stability AI official promo: stability.ai coupon
- Ideogram official promo code: ideogram.ai
- Freepik AI official: freepik.com promo code AI

TECH DEAL BLOGS AND NEWSLETTERS — search for AI promo codes here:
- site:techradar.com "promo code" AI tool 2025
- site:tomsguide.com "promo code" AI software
- site:pcmag.com "coupon code" AI tool
- site:digitaltrends.com "promo code" AI
- site:techrepublic.com AI discount code
- bestreviews.com AI software coupon
- site:cnet.com AI tool "promo code" 2025
- site:zdnet.com AI software coupon code
- wccftech.com AI promo code discount
- appsumo.com AI deals promo lifetime 2025

AFFILIATE CODE AGGREGATORS:
- Search: "AI tool" "use code" discount affiliate 2025
- "use my code" ElevenLabs OR Leonardo OR HeyGen 2025
- affiliate promo code AI platform 2025 discount

ALSO THESE SPECIFIC SEARCHES:
- best AI promo codes 2025 list
- AI tool discount code June 2025
- working AI coupon codes July 2025
- free AI credits promo code 2025
- AI subscription discount code 2025

Report every EXACT code string found, noting the provider, what it gives, and where it was found (source URL).
`;

const CODE_STRUCTURE_PROMPT = (combinedText: string) => `You are a JSON extraction specialist. Extract every distinct promo/discount code mentioned in the research text below.

Rules:
- Only extract ACTUAL CODE STRINGS that a user would enter at checkout (e.g. "SAVE20", "REDDIT15", "WELCOME2025"). Do NOT include generic signup offers with no code.
- Each code must have at minimum: provider_name and code fields.
- Deduplicate: if the same code appears multiple times, only include it once.
- Minimum code length: 3 characters.

Output ONLY a raw JSON array (no markdown, no explanation, no backticks):
[
  {
    "provider_name": "string — the AI platform name (e.g. ElevenLabs)",
    "provider_url": "string or null — official website",
    "code": "string — the exact redeemable code",
    "description": "string — what the discount provides",
    "discount_type": "percentage|free_credits|free_trial|fixed_amount|other",
    "discount_value": "string or null — e.g. 20%, $10, 3 months",
    "source_url": "string or null — URL where found",
    "source_name": "string or null — HotDeals, SimplyCodes, Reddit, YouTube, Official, etc.",
    "expires_at": "string or null — ISO date YYYY-MM-DD if mentioned",
    "status": "active|unverified|expired",
    "notes": "string or null"
  }
]

Research text to extract from:
${combinedText}`;

// ─── Structure prompt (single wave) ──────────────────────────────────────────
const STRUCTURE_PROMPT_SINGLE = (researchText: string, waveLabel: string) => `
You are a data extraction specialist. Convert the following AI provider research into a strict JSON array.

CRITICAL CLASSIFICATION RULES — READ CAREFULLY:

You MUST classify every item with an "entity_type" field:
- "ai_provider"  → An actual AI tool, platform, API service, or app that users sign up to use and may receive free credits. Examples: Runway ML, Kling AI, OpenAI, Gemini, Pika, Hailuo, any SaaS AI product.
- "blog"         → A blog post, Medium article, Substack, newsletter, or written tutorial about AI. Even if it mentions free credits, it is NOT a provider. Domain signals: medium.com, substack.com, wordpress.com, blogger.com, dev.to, hashnode.com, etc.
- "social_media" → A Facebook page/post, Instagram, Twitter/X, LinkedIn post, Reddit thread, Discord server, TikTok. NOT a provider.
- "video"        → A YouTube video, Vimeo video, Loom, or any video tutorial. NOT a provider. Domain: youtube.com, youtu.be, vimeo.com.
- "news"         → A news article, press release, or tech journalism piece. Domain signals: techcrunch.com, theverge.com, wired.com, venturebeat.com, etc.
- "aggregator"   → A directory or list of AI tools (e.g. theresanaiforthat.com, futuretools.io, topai.tools). These list tools but are not AI providers themselves.
- "other"        → Anything that doesn't fit the above.

ENTITY TYPE DECISION TREE:
1. Is the URL from youtube.com, youtu.be, vimeo.com? → entity_type = "video"
2. Is the URL from medium.com, substack.com, wordpress.com, blogspot.com, dev.to, hashnode.com? → entity_type = "blog"
3. Is the URL from facebook.com, instagram.com, twitter.com, x.com, linkedin.com, reddit.com, tiktok.com, discord.com? → entity_type = "social_media"
4. Is the URL from a news/media outlet? → entity_type = "news"
5. Is it a tool directory/aggregator? → entity_type = "aggregator"
6. Is it an actual AI product/tool/API/platform with its OWN service? → entity_type = "ai_provider"

IMPORTANT: Even if a blog post or YouTube video DISCUSSES free credits, classify it as "blog" or "video" — NOT "ai_provider".

OTHER RULES:
- Extract ALL items mentioned in the research text — include blogs, videos, social media IF they appear in the data. Classify them correctly rather than skipping.
- For "ai_provider" items only: set category, free_credit_amount, has_kling, etc. accurately.
- For non-providers (blog/video/social_media/news): set has_kling=false, requires_credit_card=false, free_credit_amount=null, category="Other".
- Normalize AI category names: ONLY use "Video AI", "Image AI", "LLM", "Multimodal", "Audio AI", or "Other".
- Each provider must have a unique website_url within this array.

=== ${waveLabel} RESEARCH DATA ===
${researchText}

Output ONLY a valid JSON array with no other text, markdown, or explanation. Each element must have EXACTLY these fields:
{
  "name": string,
  "website_url": string (canonical homepage URL),
  "description": string (1-2 sentences),
  "free_credit_amount": string or null,
  "credit_type": "USD" | "tokens" | "credits" | "API calls" | "images" | "videos" | "generations" | "prompts" | string | null,
  "has_kling": boolean,
  "kling_detail": string or null,
  "category": "Video AI" | "Image AI" | "LLM" | "Multimodal" | "Audio AI" | "Other",
  "entity_type": "ai_provider" | "blog" | "social_media" | "video" | "news" | "aggregator" | "other",
  "requires_credit_card": boolean,
  "expiry_days": number or null,
  "status": "active" | "expired" | "unverified",
  "source_url": string or null,
  "notes": string or null
}`;

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ResearchResult {
  name: string;
  website_url: string;
  description: string;
  free_credit_amount: string | null;
  credit_type: string | null;
  has_kling: boolean;
  kling_detail: string | null;
  category: string;
  entity_type?: string;
  requires_credit_card: boolean;
  expiry_days: number | null;
  status: string;
  source_url: string | null;
  notes: string | null;
}

// ─── Main research job ────────────────────────────────────────────────────────
export async function runResearchJob(jobId: number, targets: string[] = ["providers", "codes", "content"]): Promise<void> {
  const log: string[] = [];

  const appendLog = async (msg: string) => {
    log.push(`[${new Date().toISOString()}] ${msg}`);
    await db.update(researchJobsTable)
      .set({ log: log.join("\n") })
      .where(eq(researchJobsTable.id, jobId));
  };

  const runProviders = targets.includes("providers");
  const runCodes = targets.includes("codes");
  const includeContent = targets.includes("content");
  let totalFound = 0;
  let totalUpdated = 0;

  try {
    await appendLog(`Research job #${jobId} started — targets: [${targets.join(", ")}]`);

    // ─── Build complete fallback chains ───────────────────────────────────────
    // For each provider, collect ALL stored keys (active-first).
    // This means if Gemini key-1 hits 429, we try Gemini key-2, key-3, …
    // before falling back to Tavily, Exa, etc.

    interface FallbackEntry { p: string; k: string; label: string }

    /** Build ordered list of (provider, key) pairs for a given provider priority list. */
    async function buildFallbackChain(providerOrder: readonly string[]): Promise<FallbackEntry[]> {
      const chain: FallbackEntry[] = [];
      for (const p of providerOrder) {
        const keys = await getAllKeysForProvider(p);
        for (const k of keys) {
          chain.push({ p, k: k.apiKey, label: `${p}/${k.label}` });
        }
      }
      return chain;
    }

    const researchProviderOrder = ["gemini", "tavily", "exa", "firecrawl", "serper", "perplexity"] as const;
    const structureProviderOrder = ["gemini", "openai", "perplexity", "groq"] as const;

    const orderedProviders = await buildFallbackChain(researchProviderOrder);
    const orderedStructureProviders = await buildFallbackChain(structureProviderOrder);

    if (orderedProviders.length === 0) {
      throw new Error("No research provider configured. Add an API key in API Keys settings.");
    }
    if (orderedStructureProviders.length === 0) {
      throw new Error("No structuring provider configured. Add a Gemini or OpenAI API key.");
    }

    const activeResearchProvider = orderedProviders[0].p;
    const activeStructureProvider = orderedStructureProviders[0].p;

    await appendLog(
      `Research chain: ${orderedProviders.map((e) => e.label).join(" → ")} | ` +
      `Structure chain: ${orderedStructureProviders.map((e) => e.label).join(" → ")}`
    );

    async function callResearchProvider(
      provId: string, key: string, queries: string[], prompt: string,
    ): Promise<string> {
      if (provId === "gemini") {
        const genai = new GoogleGenAI({ apiKey: key });
        const resp = await genai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: { tools: [{ googleSearch: {} }], maxOutputTokens: 16384 },
        });
        return resp.text ?? "";
      } else if (provId === "tavily") return researchWithTavily(key, queries);
      else if (provId === "exa") return researchWithExa(key, queries);
      else if (provId === "firecrawl") return researchWithFirecrawl(key, queries);
      else if (provId === "serper") return researchWithSerper(key, queries);
      else return researchWithPerplexity(key, queries);
    }

    async function researchWithFallback(
      queries: string[], prompt: string, waveLabel: string,
    ): Promise<string> {
      for (let i = 0; i < orderedProviders.length; i++) {
        const { p, k, label } = orderedProviders[i];
        try {
          await appendLog(`[${waveLabel}] Trying research key ${i + 1}/${orderedProviders.length}: ${label}...`);
          const text = await callResearchProvider(p, k, queries, prompt);
          if (text.trim()) {
            await appendLog(`[${waveLabel}] Success with ${label} (${text.length.toLocaleString()} chars)`);
            return text;
          }
          await appendLog(`[${waveLabel}] ${label} returned empty — trying next key...`);
        } catch (err) {
          const msg = (err as Error).message.substring(0, 150);
          await appendLog(`[${waveLabel}] Key ${label} failed: ${msg} — trying next...`);
        }
      }
      throw new Error(`All research keys exhausted for ${waveLabel}. Add more API keys in settings.`);
    }

    /** Split text into chunks of at most maxChars, preferring splits at separator boundaries. */
    function chunkText(text: string, maxChars: number): string[] {
      if (text.length <= maxChars) return [text];
      const separator = "\n\n---\n\n";
      const parts = text.split(separator);
      const chunks: string[] = [];
      let current = "";
      for (const part of parts) {
        const candidate = current ? current + separator + part : part;
        if (candidate.length > maxChars && current) {
          chunks.push(current);
          current = part;
        } else {
          current = candidate;
        }
      }
      if (current) chunks.push(current);
      // If a single part is still too long, hard-split it
      const result: string[] = [];
      for (const chunk of chunks) {
        if (chunk.length <= maxChars) { result.push(chunk); continue; }
        for (let i = 0; i < chunk.length; i += maxChars) {
          result.push(chunk.slice(i, i + maxChars));
        }
      }
      return result;
    }

    async function callStructureProvider(p: string, k: string, researchText: string, waveLabel: string): Promise<ResearchResult[]> {
      if (p === "gemini")     return structureWithGemini(k, researchText, waveLabel);
      if (p === "groq")       return structureWithGroq(k, researchText, waveLabel);
      if (p === "perplexity") return structureWithPerplexity(k, researchText, waveLabel);
      return structureWithOpenAI(k, researchText, waveLabel);
    }

    /** Try one provider with up to MAX_RETRIES for transient 503 errors. */
    async function tryStructureProvider(p: string, k: string, researchText: string, waveLabel: string): Promise<ResearchResult[]> {
      const MAX_RETRIES = 3;
      const RETRY_DELAY_MS = 10000;
      // Groq has a strict HTTP request-body size limit (~100KB total).
      // OpenAI/Perplexity handle larger payloads but we keep chunks reasonable.
      // Gemini can process the full research text without chunking.
      const CHUNK_SIZE =
        p === "groq"       ? 8_000 :
        p === "openai"     ? 40_000 :
        p === "perplexity" ? 40_000 :
                             80_000;  // gemini
      const chunks = chunkText(researchText, CHUNK_SIZE);
      const allResults: ResearchResult[] = [];

      for (let ci = 0; ci < chunks.length; ci++) {
        const chunkLabel = chunks.length > 1 ? `${waveLabel} (chunk ${ci + 1}/${chunks.length})` : waveLabel;
        let lastErr: unknown;
        let succeeded = false;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          try {
            const result = await callStructureProvider(p, k, chunks[ci], chunkLabel);
            allResults.push(...result);
            succeeded = true;
            break;
          } catch (err) {
            lastErr = err;
            if (isTransient(err) && attempt < MAX_RETRIES) {
              await appendLog(`Structure ${p} ${chunkLabel} attempt ${attempt}/${MAX_RETRIES} — transient, retrying in ${RETRY_DELAY_MS / 1000}s...`);
              await sleep(RETRY_DELAY_MS);
            } else {
              break;
            }
          }
        }
        if (!succeeded) throw lastErr ?? new Error(`${p} failed for ${chunkLabel}`);
      }
      return allResults;
    }

    async function structureWithFallback(
      researchText: string, waveLabel: string,
    ): Promise<ResearchResult[]> {
      // ── Try LLM providers first ───────────────────────────────────────────
      for (let i = 0; i < orderedStructureProviders.length; i++) {
        const { p, k, label } = orderedStructureProviders[i];
        try {
          await appendLog(`[${waveLabel}] Trying structure key ${i + 1}/${orderedStructureProviders.length}: ${label}...`);
          const result = await tryStructureProvider(p, k, researchText, waveLabel);
          if (result.length > 0) {
            await appendLog(`[${waveLabel}] Structure success with ${label} — ${result.length} providers extracted`);
            return result;
          }
          await appendLog(`[${waveLabel}] ${label} returned 0 results — trying next key...`);
        } catch (err) {
          const msg = (err as Error).message.substring(0, 150);
          await appendLog(`[${waveLabel}] Structure key ${label} failed: ${msg} — trying next...`);
        }
      }

      // ── Last resort: rule-based parser (no API key needed) ────────────────
      await appendLog(`[${waveLabel}] All LLM providers exhausted — falling back to rule-based parser...`);
      const ruleResults = structureWithRuleBased(researchText);
      if (ruleResults.length > 0) {
        await appendLog(`[${waveLabel}] Rule-based parser extracted ${ruleResults.length} providers (quality lower than LLM). Add Groq key (free) at console.groq.com for better results.`);
        return ruleResults;
      }

      throw new Error(`All structure methods failed for ${waveLabel}. Research text may be malformed.`);
    }

    if (runProviders) {
    // ─── Wave 1 research ─────────────────────────────────────────────────────
    await appendLog(`Wave 1/3: Researching Western & mainstream providers via ${activeResearchProvider} (with fallback)...`);
    const wave1Text = await researchWithFallback(SEARCH_QUERIES_WAVE1, RESEARCH_PROMPT_WAVE1, "Wave 1");
    await appendLog(`Wave 1 complete — ${wave1Text.length.toLocaleString()} chars`);

    // ─── Wave 2 research ─────────────────────────────────────────────────────
    await appendLog(`Wave 2/3: Researching Asian, Russian, European & emerging providers via ${activeResearchProvider} (with fallback)...`);
    const wave2Text = await researchWithFallback(SEARCH_QUERIES_WAVE2, RESEARCH_PROMPT_WAVE2, "Wave 2");
    await appendLog(`Wave 2 complete — ${wave2Text.length.toLocaleString()} chars`);

    // ─── Wave 3 research ─────────────────────────────────────────────────────
    await appendLog(`Wave 3/3: Researching end-user SaaS AI tools & applications via ${activeResearchProvider} (with fallback)...`);
    const wave3Text = await researchWithFallback(SEARCH_QUERIES_WAVE3, RESEARCH_PROMPT_WAVE3, "Wave 3");
    await appendLog(`Wave 3 complete — ${wave3Text.length.toLocaleString()} chars. Total: ${(wave1Text.length + wave2Text.length + wave3Text.length).toLocaleString()} chars`);

    // ── Phase 2a: Structure Wave 1 ──────────────────────────────────────────
    await appendLog(`Phase 2a: Structuring Wave 1 via ${activeStructureProvider} (with fallback)...`);
    const wave1Providers = await structureWithFallback(wave1Text, "WAVE 1 — WESTERN & MAINSTREAM");
    await appendLog(`Phase 2a complete — ${wave1Providers.length} providers from Wave 1`);

    // ── Phase 2b: Structure Wave 2 ──────────────────────────────────────────
    await appendLog(`Phase 2b: Structuring Wave 2 via ${activeStructureProvider} (with fallback)...`);
    const wave2Providers = await structureWithFallback(wave2Text, "WAVE 2 — ASIAN, RUSSIAN, EUROPEAN & EMERGING");
    await appendLog(`Phase 2b complete — ${wave2Providers.length} providers from Wave 2`);

    // ── Phase 2c: Structure Wave 3 ──────────────────────────────────────────
    await appendLog(`Phase 2c: Structuring Wave 3 via ${activeStructureProvider} (with fallback)...`);
    const wave3Providers = await structureWithFallback(wave3Text, "WAVE 3 — END-USER SAAS AI TOOLS");
    await appendLog(`Phase 2c complete — ${wave3Providers.length} providers from Wave 3`);

    const allProviders = [...wave1Providers, ...wave2Providers, ...wave3Providers];

    // Deduplicate by website_url (keep first occurrence)
    const seenUrls = new Set<string>();
    const uniqueProviders = allProviders.filter((p) => {
      if (!p || typeof p.name !== "string" || !p.name.trim()) return false;
      if (!p.website_url || typeof p.website_url !== "string") return false;
      const url = p.website_url.toLowerCase().replace(/\/$/, "");
      if (seenUrls.has(url)) return false;
      seenUrls.add(url);
      return true;
    });

    const skipped = allProviders.length - uniqueProviders.length;
    if (skipped > 0) {
      await appendLog(`Deduplicated: removed ${skipped} duplicate entries`);
    }
    await appendLog(`Parsed ${uniqueProviders.length} unique providers — upserting to database...`);

    // ── Upsert to DB ────────────────────────────────────────────────────────
    const upsertStartTime = new Date();
    let updated = 0;
    let failed = 0;

    // Filter entity types: only store ai_provider if content target is not selected
    const entitiesToUpsert = includeContent
      ? uniqueProviders
      : uniqueProviders.filter((p) => {
          const et = (p as unknown as { entity_type?: string }).entity_type ?? "ai_provider";
          return et === "ai_provider";
        });
    if (!includeContent && entitiesToUpsert.length < uniqueProviders.length) {
      await appendLog(`Content filter: keeping ${entitiesToUpsert.length}/${uniqueProviders.length} ai_provider entries (${uniqueProviders.length - entitiesToUpsert.length} non-provider content excluded)`);
    }

    for (const p of entitiesToUpsert) {
      try {
        const entityType = (p as unknown as { entity_type?: string }).entity_type ?? "ai_provider";
        await db.execute(sql`
          INSERT INTO providers (
            name, website_url, description, free_credit_amount, credit_type,
            has_kling, kling_detail, category, entity_type, requires_credit_card, expiry_days,
            status, last_verified_at, source_url, notes, created_at, updated_at
          ) VALUES (
            ${p.name}, ${p.website_url}, ${p.description ?? null}, ${p.free_credit_amount ?? null},
            ${p.credit_type ?? null}, ${Boolean(p.has_kling)}, ${p.kling_detail ?? null},
            ${p.category ?? "Other"}, ${entityType}, ${Boolean(p.requires_credit_card)}, ${p.expiry_days ?? null},
            ${p.status ?? "unverified"}, NOW(), ${p.source_url ?? null}, ${p.notes ?? null},
            NOW(), NOW()
          )
          ON CONFLICT (website_url) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            free_credit_amount = EXCLUDED.free_credit_amount,
            credit_type = EXCLUDED.credit_type,
            has_kling = EXCLUDED.has_kling,
            kling_detail = EXCLUDED.kling_detail,
            category = EXCLUDED.category,
            entity_type = EXCLUDED.entity_type,
            requires_credit_card = EXCLUDED.requires_credit_card,
            expiry_days = EXCLUDED.expiry_days,
            status = EXCLUDED.status,
            last_verified_at = NOW(),
            source_url = EXCLUDED.source_url,
            notes = EXCLUDED.notes,
            updated_at = NOW()
        `);
        updated++;
      } catch (err) {
        failed++;
        await appendLog(`Error upserting "${p.name}": ${err}`);
      }
    }

    await appendLog(`Database upsert complete: ${updated} succeeded, ${failed} failed`);

    // ── Cleanup stale providers (not seen in this run) ───────────────────────
    // Safety: only clean up if this run found a meaningful number of providers.
    // If research was limited (API errors, quotas, etc.), preserve existing data.
    if (updated >= 30) {
      const staleResult = await db.execute(sql`
        DELETE FROM providers
        WHERE updated_at < ${upsertStartTime}
      `);
      const staleCount = (staleResult as unknown as { rowCount?: number }).rowCount ?? 0;
      if (staleCount > 0) {
        await appendLog(`Cleanup: removed ${staleCount} stale providers not found in this run`);
      }
    } else {
      await appendLog(`Safety: only ${updated} providers upserted (threshold: 30) — preserving existing records. Research coverage may have been limited by API quotas.`);
    }

    // ── Compute quality scores ───────────────────────────────────────────────
    await db.execute(sql`
      UPDATE providers SET quality_score = (
        CASE WHEN entity_type = 'ai_provider' THEN 40 ELSE 0 END +
        CASE WHEN status = 'active' THEN 25 ELSE 0 END +
        CASE WHEN free_credit_amount IS NOT NULL AND free_credit_amount != '' THEN 15 ELSE 0 END +
        CASE WHEN requires_credit_card = false THEN 10 ELSE 0 END +
        CASE WHEN has_kling = true THEN 5 ELSE 0 END +
        CASE WHEN description IS NOT NULL AND LENGTH(description) > 50 THEN 5 ELSE 0 END
      )
    `);
    await appendLog(`Quality scores computed for all providers`);

    totalFound = uniqueProviders.length;
    totalUpdated = updated;
    } // ─── end if (runProviders) ───────────────────────────────────────────────

    // ─── Code research ────────────────────────────────────────────────────────
    if (runCodes) {
      await appendLog("=== Code Research: hunting promo codes via AI web search... ===");
      try {
        const codesFound = await runCodeResearchJob(appendLog);
        await appendLog(`Code Research complete: ${codesFound} promo codes discovered and saved`);
      } catch (err) {
        const errMsg = (err as Error).message.substring(0, 200);
        await appendLog(`Code Research failed: ${errMsg}`);
      }
    }

    await db.update(researchJobsTable)
      .set({
        status: "completed",
        completedAt: new Date(),
        providersFound: totalFound,
        providersUpdated: totalUpdated,
        log: log.join("\n"),
      })
      .where(eq(researchJobsTable.id, jobId));

    logger.info({ jobId, total: totalFound, updated: totalUpdated }, "Research job completed");

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.push(`[${new Date().toISOString()}] FATAL ERROR: ${errMsg}`);
    logger.error({ jobId, err: errMsg }, "Research job failed");

    await db.update(researchJobsTable)
      .set({
        status: "failed",
        completedAt: new Date(),
        errorMessage: errMsg,
        log: log.join("\n"),
      })
      .where(eq(researchJobsTable.id, jobId));
  }
}

// ─── Search queries for code research fallback providers ─────────────────────
const CODE_QUERIES_COUPON_SITES = [
  "site:simplycodes.com AI tool promo code 2025",
  "site:hotdeals.com AI software coupon code 2025",
  "site:couponbirds.com AI platform discount code",
  "site:dealspotr.com AI tool promo code 2025",
  "site:retailmenot.com ElevenLabs Leonardo AI HeyGen coupon",
  "site:slickdeals.net AI software promo code 2025",
  "ElevenLabs promo code simplycodes couponbirds 2025",
  "Leonardo AI coupon code dealspotr retailmenot 2025",
  "Midjourney discount code coupon site 2025",
  "HeyGen Suno Runway promo code coupon site 2025",
  "Jasper Copy.ai Cursor AI coupon code simplycodes 2025",
  "AI tool AppSumo lifetime deal promo code 2025",
  "Synthesia Descript InVideo AI coupon code 2025",
];

const CODE_QUERIES_COMMUNITY = [
  "site:reddit.com/r/ChatGPT promo code discount 2025",
  "site:reddit.com/r/StableDiffusion coupon code AI 2025",
  "site:reddit.com/r/midjourney discount promo code 2025",
  "site:reddit.com/r/artificial promo code AI tool 2025",
  "ElevenLabs promo code Reddit YouTube creator 2025",
  "Leonardo AI discount code Reddit community 2025",
  "HeyGen Suno promo code Reddit YouTube 2025",
  "AI tool creator affiliate discount code YouTube 2025",
  "\"use code\" ElevenLabs OR Midjourney OR Leonardo AI discount 2025",
  "AI platform promo code Twitter X community 2025",
];

const CODE_QUERIES_OFFICIAL = [
  "ElevenLabs official promo code affiliate discount 2025",
  "Leonardo AI official coupon affiliate code 2025",
  "HeyGen official promo code partner discount 2025",
  "Runway ML official promo affiliate discount code 2025",
  "Suno AI official discount promo code 2025",
  "Jasper AI official coupon affiliate code 2025",
  "Copy.ai official promo code discount 2025",
  "NightCafe Pika Labs official promo code 2025",
  "AI tool promo code tech blog pcmag cnet 2025",
  "best working AI promo codes list July 2025",
  "AI subscription discount code newsletter 2025",
  "Cursor AI Perplexity Stability AI official coupon 2025",
];

// ─── Code research job (3-wave with fallback chain) ───────────────────────────
export async function runCodeResearchJob(appendLog?: (msg: string) => Promise<void>): Promise<number> {
  await appendLog?.("Code Research: building fallback chain — Gemini → Tavily → Exa → Firecrawl → Serper → Perplexity...");

  // Build the same fallback chain as the main research job
  interface FallbackEntry { p: string; k: string; label: string }

  async function buildCodeFallbackChain(): Promise<FallbackEntry[]> {
    const researchOrder = ["gemini", "tavily", "exa", "firecrawl", "serper", "perplexity"] as const;
    const chain: FallbackEntry[] = [];
    for (const p of researchOrder) {
      const keys = await getAllKeysForProvider(p);
      for (const k of keys) chain.push({ p, k: k.apiKey, label: `${p}/${k.label}` });
    }
    return chain;
  }

  const fallbackChain = await buildCodeFallbackChain();
  if (fallbackChain.length === 0) {
    throw new Error("No API keys configured. Add a Gemini, Tavily, Exa, Serper or Perplexity key in API Keys settings.");
  }
  await appendLog?.(`Code Research: chain = ${fallbackChain.map((e) => e.label).join(" → ")}`);

  type CodeEntry = {
    provider_name: string;
    provider_url?: string | null;
    code: string;
    description: string;
    discount_type?: string | null;
    discount_value?: string | null;
    source_url?: string | null;
    source_name?: string | null;
    expires_at?: string | null;
    status?: string;
    notes?: string | null;
  };

  // Try each provider in fallback chain for one wave
  async function runWave(prompt: string, queries: string[], label: string): Promise<string> {
    for (let i = 0; i < fallbackChain.length; i++) {
      const { p, k, labelKey } = { ...fallbackChain[i], labelKey: fallbackChain[i].label };
      await appendLog?.(`Code Wave ${label}: trying ${labelKey} (${i + 1}/${fallbackChain.length})...`);
      try {
        let text = "";
        if (p === "gemini") {
          const genai = new GoogleGenAI({ apiKey: k });
          const resp = await genai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: { tools: [{ googleSearch: {} }], maxOutputTokens: 16384 },
          });
          text = resp.text ?? "";
        } else if (p === "tavily") {
          text = await researchWithTavily(k, queries);
        } else if (p === "exa") {
          text = await researchWithExa(k, queries);
        } else if (p === "firecrawl") {
          text = await researchWithFirecrawl(k, queries);
        } else if (p === "serper") {
          text = await researchWithSerper(k, queries);
        } else if (p === "perplexity") {
          text = await researchWithPerplexity(k, queries);
        }
        if (text.trim()) {
          await appendLog?.(`Code Wave ${label}: success with ${labelKey} — ${text.length.toLocaleString()} chars`);
          return text;
        }
        await appendLog?.(`Code Wave ${label}: ${labelKey} returned empty — trying next...`);
      } catch (err) {
        const msg = (err instanceof Error ? err.message : String(err)).substring(0, 150);
        await appendLog?.(`Code Wave ${label}: ${labelKey} failed (${msg}) — trying next...`);
      }
    }
    await appendLog?.(`Code Wave ${label}: all providers exhausted — skipping wave`);
    return "";
  }

  // Run waves SEQUENTIALLY to avoid triggering parallel rate limits
  await appendLog?.("Code Research: running Wave A (Coupon Sites)...");
  const textA = await runWave(CODE_PROMPT_COUPON_SITES, CODE_QUERIES_COUPON_SITES, "A (Coupon Sites)");
  await sleep(3000);

  await appendLog?.("Code Research: running Wave B (Community/Reddit/YouTube)...");
  const textB = await runWave(CODE_PROMPT_COMMUNITY, CODE_QUERIES_COMMUNITY, "B (Community/Reddit/YouTube)");
  await sleep(3000);

  await appendLog?.("Code Research: running Wave C (Official/Newsletters)...");
  const textC = await runWave(CODE_PROMPT_OFFICIAL, CODE_QUERIES_OFFICIAL, "C (Official/Newsletters)");

  const allText = [
    textA ? `\n\n=== WAVE A: COUPON AGGREGATOR SITES ===\n${textA}` : "",
    textB ? `\n\n=== WAVE B: COMMUNITY / REDDIT / YOUTUBE ===\n${textB}` : "",
    textC ? `\n\n=== WAVE C: OFFICIAL PAGES / NEWSLETTERS ===\n${textC}` : "",
  ].filter(Boolean).join("");

  if (!allText.trim()) {
    throw new Error("All 3 code research waves returned empty. Check Gemini API key or quota.");
  }

  await appendLog?.(`Code Research: all waves complete — ${allText.length.toLocaleString()} chars total. Structuring...`);

  // Step 2: Structure combined text into JSON
  // Trim to ~80k chars so we stay within Gemini's token budget
  const trimmedText = allText.length > 80000 ? allText.substring(0, 80000) + "\n...[truncated]" : allText;

  const structGenai = await getGenAI();
  const structResp = await structGenai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: CODE_STRUCTURE_PROMPT(trimmedText) }] }],
    config: { responseMimeType: "application/json", maxOutputTokens: 16384 },
  });

  let codes: CodeEntry[] = [];
  try {
    const raw = structResp.text ?? "[]";
    const parsed = JSON.parse(raw);
    codes = Array.isArray(parsed) ? parsed : [];
  } catch {
    try {
      codes = JSON.parse(jsonrepair(structResp.text ?? "[]"));
    } catch {
      codes = [];
    }
  }

  await appendLog?.(`Code Research: structured ${codes.length} raw code entries from combined waves`);

  // Filter: must have a real code string (min 3 chars, no spaces-only)
  const validCodes = codes.filter(
    (c) => c && typeof c.provider_name === "string" && c.provider_name.trim()
      && typeof c.code === "string" && c.code.trim().length >= 3
  );

  // Deduplicate by (provider_name.toLowerCase, code.toUpperCase)
  const seen = new Set<string>();
  const uniqueCodes = validCodes.filter((c) => {
    const key = `${c.provider_name.toLowerCase().trim()}|${c.code.toUpperCase().trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  await appendLog?.(`Code Research: ${uniqueCodes.length} unique valid codes after dedup (was ${codes.length} raw)`);

  // Upsert to DB
  let saved = 0;
  const upsertStart = new Date();

  for (const c of uniqueCodes) {
    try {
      const expiresAt = c.expires_at ? new Date(c.expires_at) : null;
      if (expiresAt && isNaN(expiresAt.getTime())) {
        // skip bad date
      }
      await db.execute(sql`
        INSERT INTO promo_codes (
          provider_name, provider_url, code, description,
          discount_type, discount_value, source_url, source_name,
          expires_at, status, notes, created_at, updated_at
        ) VALUES (
          ${c.provider_name.trim()}, ${c.provider_url ?? null}, ${c.code.trim()}, ${c.description ?? ""},
          ${c.discount_type ?? null}, ${c.discount_value ?? null}, ${c.source_url ?? null}, ${c.source_name ?? null},
          ${expiresAt && !isNaN(expiresAt.getTime()) ? expiresAt : null},
          ${c.status ?? "unverified"}, ${c.notes ?? null}, NOW(), NOW()
        )
        ON CONFLICT (provider_name, code) DO UPDATE SET
          description = EXCLUDED.description,
          discount_type = EXCLUDED.discount_type,
          discount_value = EXCLUDED.discount_value,
          source_url = EXCLUDED.source_url,
          source_name = EXCLUDED.source_name,
          expires_at = EXCLUDED.expires_at,
          status = EXCLUDED.status,
          notes = EXCLUDED.notes,
          updated_at = NOW()
      `);
      saved++;
    } catch {
      // skip individual row errors
    }
  }

  // Remove codes not seen in this run to keep data fresh
  if (saved >= 3) {
    await db.execute(sql`DELETE FROM promo_codes WHERE updated_at < ${upsertStart}`);
    await appendLog?.(`Code Research: removed stale codes not found in this run`);
  }

  logger.info({ saved, total: uniqueCodes.length }, "Code research job completed");
  await appendLog?.(`Code Research DONE: saved ${saved} codes to database`);
  return saved;
}

// ─── Stale job recovery ───────────────────────────────────────────────────────
export async function recoverStaleJobs(): Promise<void> {
  try {
    await db.update(researchJobsTable)
      .set({
        status: "failed",
        completedAt: new Date(),
        errorMessage: "Server restarted while job was in progress",
      })
      .where(sql`status IN ('pending', 'running')`);
    logger.info("Stale job recovery complete");
  } catch (err) {
    logger.error({ err }, "Failed to recover stale jobs");
  }
}

// index.js
import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.warn("⚠️ BOT_TOKEN is not set. Set BOT_TOKEN env var before running.");
}

// Full list of known Discord user flags & values (as of current API docs)
const USER_FLAGS = {
  STAFF: 1 << 0,                     // 1
  PARTNER: 1 << 1,                   // 2
  HYPESQUAD_EVENTS: 1 << 2,          // 4
  BUG_HUNTER_LEVEL_1: 1 << 3,        // 8
  MFA_SMS: 1 << 4,                   // 16 (unstable)
  PREMIUM_PROMO_DISMISSED: 1 << 5,   // 32 (unstable)
  HOUSE_BRAVERY: 1 << 6,             // 64
  HOUSE_BRILLIANCE: 1 << 7,          // 128
  HOUSE_BALANCE: 1 << 8,             // 256
  EARLY_SUPPORTER: 1 << 9,           // 512 (PremiumEarlySupporter)
  TEAM_PSEUDO_USER: 1 << 10,         // 1024
  BUG_HUNTER_LEVEL_2: 1 << 14,       // 16384
  VERIFIED_BOT: 1 << 16,             // 65536
  VERIFIED_DEVELOPER: 1 << 17,       // 131072 (Early Verified Bot Developer)
  CERTIFIED_MODERATOR: 1 << 18,      // 262144
  BOT_HTTP_INTERACTIONS: 1 << 19,    // 524288
  SPAMMER: 1 << 20,                  // 1048576 (unstable)
  DISABLE_PREMIUM: 1 << 21,          // 2097152 (unstable)
  ACTIVE_DEVELOPER: 1 << 22,         // 4194304
  HAS_UNREAD_URGENT_MESSAGES: 1 << 13, // 8192 (unstable)
  COLLABORATOR: 1n << 50n,           // 1125899906842624 (unstable, BigInt)
  RESTRICTED_COLLABORATOR: 1n << 51n,// 2251799813685248 (unstable, BigInt)
  QUARANTINED: 1n << 44n             // 17592186044416 (unstable, BigInt)
};

// Friendly names to show to API clients
const FRIENDLY = {
  STAFF: "Discord Employee",
  PARTNER: "Partnered Server Owner",
  HYPESQUAD_EVENTS: "HypeSquad Events",
  BUG_HUNTER_LEVEL_1: "Bug Hunter Level 1",
  MFA_SMS: "MFA SMS (flag)",
  PREMIUM_PROMO_DISMISSED: "Premium Promo Dismissed",
  HOUSE_BRAVERY: "HypeSquad Bravery (House)",
  HOUSE_BRILLIANCE: "HypeSquad Brilliance (House)",
  HOUSE_BALANCE: "HypeSquad Balance (House)",
  EARLY_SUPPORTER: "Early Supporter",
  TEAM_PSEUDO_USER: "Team User (pseudo)",
  BUG_HUNTER_LEVEL_2: "Bug Hunter Level 2",
  VERIFIED_BOT: "Verified Bot",
  VERIFIED_DEVELOPER: "Early Verified Bot Developer",
  CERTIFIED_MODERATOR: "Discord Certified Moderator",
  BOT_HTTP_INTERACTIONS: "Bot HTTP Interactions",
  SPAMMER: "Spammer (flag)",
  DISABLE_PREMIUM: "Disable Premium (flag)",
  ACTIVE_DEVELOPER: "Active Developer",
  HAS_UNREAD_URGENT_MESSAGES: "Has Unread Urgent Messages",
  COLLABORATOR: "Collaborator (unstable)",
  RESTRICTED_COLLABORATOR: "Restricted Collaborator (unstable)",
  QUARANTINED: "Quarantined (unstable)"
};

// Nitro subscription badges based on duration
const NITRO_BADGES = {
  1: "Bronze (1 Month)",
  3: "Silver (3 Months)", 
  6: "Gold (6 Months)",
  12: "Platinum (1 Year)",
  24: "Diamond (2 Years)",
  36: "Emerald (3 Years)",
  60: "Ruby (5 Years)",
  72: "Opal (6+ Years)"
};

// Function to decode numeric flags (supports BigInt flags)
function decodeFlags(raw) {
  if (raw === null || raw === undefined) return [];
  // convert to BigInt to safely test large values
  let flags = (typeof raw === "bigint") ? raw : BigInt(raw);
  const found = [];

  for (const [key, val] of Object.entries(USER_FLAGS)) {
    const flagVal = (typeof val === "bigint") ? val : BigInt(val);
    if ((flags & flagVal) === flagVal) {
      found.push(FRIENDLY[key] || key);
    }
  }

  return found;
}

// Function to calculate Nitro subscription duration and badge
function getNitroBadge(premiumSince) {
  if (!premiumSince) return null;
  
  const premiumStart = new Date(premiumSince);
  const now = new Date();
  const diffTime = Math.abs(now - premiumStart);
  const diffMonths = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30)); // Approximate months
  
  // Find the highest badge the user qualifies for
  const badgeMonths = Object.keys(NITRO_BADGES).map(Number).sort((a, b) => b - a);
  for (const months of badgeMonths) {
    if (diffMonths >= months) {
      return {
        badge: NITRO_BADGES[months],
        months: diffMonths,
        started: premiumSince
      };
    }
  }
  
  // If less than 1 month but has premium
  if (diffMonths < 1) {
    return {
      badge: "New Subscriber",
      months: diffMonths,
      started: premiumSince
    };
  }
  
  return null;
}

// root
app.get("/", (req, res) => {
  res.send("✅ Discord Badge API is running. Use /user/:id");
});

// user endpoint
app.get("/user/:id", async (req, res) => {
  const userId = req.params.id;
  if (!/^\d+$/.test(userId)) {
    return res.status(400).json({ error: "Invalid user id" });
  }
  if (!BOT_TOKEN) {
    return res.status.status(500).json({ error: "BOT_TOKEN not configured on server" });
  }

  try {
    // First, try to get guild member data to access premium_since
    let premiumSince = null;
    let guildMemberData = null;
    
    // You might want to specify a guild ID where your bot can check membership
    const GUILD_ID = process.env.GUILD_ID; // Optional: set this env var for more accurate data
    
    if (GUILD_ID) {
      try {
        const guildResponse = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}`, {
          headers: { Authorization: `Bot ${BOT_TOKEN}` }
        });
        
        if (guildResponse.ok) {
          guildMemberData = await guildResponse.json();
          premiumSince = guildMemberData.premium_since;
        }
      } catch (guildErr) {
        console.warn(`Could not fetch guild member data for ${userId}:`, guildErr.message);
      }
    }
    
    // Fallback: get user data directly
    const response = await fetch(`https://discord.com/api/v10/users/${userId}`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` }
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: "Discord API error", detail: text });
    }

    const data = await response.json();

    // decode public_flags (could be a number or null)
    const badges = decodeFlags(data.public_flags ?? 0);

    // Get Nitro badge info
    const nitroBadge = getNitroBadge(premiumSince);
    
    // infer Nitro: animated avatar (avatar starts with "a_"), banner set, or avatar_decorations
    const hasNitroFeatures = Boolean(
      (data.avatar && typeof data.avatar === "string" && data.avatar.startsWith("a_")) ||
      data.banner ||
      data.avatar_decoration ||
      data.avatar_decoration_data
    );

    // Add Nitro badge to badges array if available
    if (nitroBadge) {
      badges.push(nitroBadge.badge);
    }

    res.json({
      id: data.id,
      username: data.username,
      discriminator: data.discriminator,
      global_name: data.global_name ?? null,
      badges,
      likelyNitro: hasNitroFeatures || Boolean(nitroBadge),
      nitroBadge: nitroBadge, // Detailed nitro badge info
      premium_since: premiumSince, // When they started Nitro
      avatar_url: data.avatar ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png` : null,
      raw_public_flags: data.public_flags ?? 0
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// New endpoint to get detailed Nitro information
app.get("/user/:id/nitro", async (req, res) => {
  const userId = req.params.id;
  if (!/^\d+$/.test(userId)) {
    return res.status(400).json({ error: "Invalid user id" });
  }
  if (!BOT_TOKEN) {
    return res.status(500).json({ error: "BOT_TOKEN not configured on server" });
  }

  try {
    let premiumSince = null;
    const GUILD_ID = process.env.GUILD_ID;
    
    if (GUILD_ID) {
      try {
        const guildResponse = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}`, {
          headers: { Authorization: `Bot ${BOT_TOKEN}` }
        });
        
        if (guildResponse.ok) {
          const guildMemberData = await guildResponse.json();
          premiumSince = guildMemberData.premium_since;
        }
      } catch (guildErr) {
        console.warn(`Could not fetch guild member data for ${userId}:`, guildErr.message);
      }
    }

    const nitroBadge = getNitroBadge(premiumSince);
    
    if (!nitroBadge) {
      return res.json({
        hasNitro: false,
        message: "User does not have an active Nitro subscription or subscription data is not available"
      });
    }

    res.json({
      hasNitro: true,
      badge: nitroBadge.badge,
      monthsSubscribed: nitroBadge.months,
      subscriptionStart: nitroBadge.started,
      nextMilestone: getNextMilestone(nitroBadge.months),
      allMilestones: NITRO_BADGES
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Helper function to get next milestone
function getNextMilestone(currentMonths) {
  const milestones = Object.keys(NITRO_BADGES).map(Number).sort((a, b) => a - b);
  for (const months of milestones) {
    if (currentMonths < months) {
      return {
        monthsRequired: months,
        badge: NITRO_BADGES[months],
        monthsToGo: months - currentMonths
      };
    }
  }
  return null;
}

app.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));

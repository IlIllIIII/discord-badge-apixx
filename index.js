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

// Function to calculate Nitro badge based on premium_since timestamp
function getNitroBadgeFromPremiumSince(premiumSince) {
  if (!premiumSince) return null;
  
  const premiumStart = new Date(premiumSince);
  const now = new Date();
  const diffTime = Math.abs(now - premiumStart);
  const diffMonths = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30)); // Approximate months
  
  console.log(`Nitro subscription: ${diffMonths} months since ${premiumStart}`);
  
  // Find the highest badge the user qualifies for
  const badgeMonths = Object.keys(NITRO_BADGES).map(Number).sort((a, b) => b - a);
  for (const months of badgeMonths) {
    if (diffMonths >= months) {
      return {
        badge: NITRO_BADGES[months],
        tier: getTierFromBadge(NITRO_BADGES[months]),
        months: diffMonths,
        started: premiumSince,
        exact: true
      };
    }
  }
  
  // If less than 1 month but has premium
  if (diffMonths < 1) {
    return {
      badge: "Bronze (1 Month)",
      tier: "Bronze",
      months: diffMonths,
      started: premiumSince,
      exact: true
    };
  }
  
  return null;
}

// Function to extract tier from badge name
function getTierFromBadge(badgeName) {
  const tierMatch = badgeName.match(/^(Bronze|Silver|Gold|Platinum|Diamond|Emerald|Ruby|Opal)/);
  return tierMatch ? tierMatch[1] : "Unknown";
}

// Function to check multiple guilds for premium_since and booster data
async function getGuildMemberData(userId, botToken) {
  const guildsToCheck = process.env.GUILD_IDS ? process.env.GUILD_IDS.split(',') : [];
  
  for (const guildId of guildsToCheck) {
    try {
      const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, {
        headers: { Authorization: `Bot ${botToken}` }
      });
      
      if (response.ok) {
        const memberData = await response.json();
        const result = {};
        
        if (memberData.premium_since) {
          console.log(`Found premium_since for ${userId} in guild ${guildId}: ${memberData.premium_since}`);
          result.premium_since = memberData.premium_since;
        }
        
        // Check if user is boosting this server
        if (memberData.premium_since) {
          result.is_booster = true;
          result.boosting_since = memberData.premium_since;
          result.boosting_guild = guildId;
        }
        
        if (Object.keys(result).length > 0) {
          return result;
        }
      }
    } catch (error) {
      console.warn(`Failed to check guild ${guildId} for user ${userId}:`, error.message);
    }
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
    return res.status(500).json({ error: "BOT_TOKEN not configured on server" });
  }

  try {
    // Get user data first
    const userResponse = await fetch(`https://discord.com/api/v10/users/${userId}`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` }
    });

    if (!userResponse.ok) {
      const text = await userResponse.text();
      return res.status(userResponse.status).json({ error: "Discord API error", detail: text });
    }

    const userData = await userResponse.json();

    // decode public_flags (could be a number or null)
    const badges = decodeFlags(userData.public_flags ?? 0);

    // Try to get guild member data (premium_since and booster info)
    const guildMemberData = await getGuildMemberData(userId, BOT_TOKEN);
    let premiumSince = guildMemberData?.premium_since || null;
    let nitroBadge = null;

    // Check for Nitro features
    const hasNitroFeatures = Boolean(
      (userData.avatar && typeof userData.avatar === 'string' && userData.avatar.startsWith('a_')) ||
      userData.banner ||
      userData.avatar_decoration ||
      userData.avatar_decoration_data ||
      userData.premium_type > 0
    );

    // If we have premium_since, calculate exact badge
    if (premiumSince) {
      nitroBadge = getNitroBadgeFromPremiumSince(premiumSince);
    } 
    // If no premium_since but has Nitro features, show default Bronze
    else if (hasNitroFeatures) {
      nitroBadge = {
        badge: "Bronze (1 Month)",
        tier: "Bronze",
        months: 1,
        estimated: true,
        reason: "Nitro detected but subscription date unknown"
      };
    }

    // Add Nitro badge to badges array if available
    if (nitroBadge && !badges.includes(nitroBadge.badge)) {
      badges.push(nitroBadge.badge);
    }

    // Check booster status
    const isBooster = Boolean(guildMemberData?.is_booster);

    res.json({
      id: userData.id,
      username: userData.username,
      discriminator: userData.discriminator,
      global_name: userData.global_name ?? null,
      bio: userData.bio || null, // User's bio/profile description
      badges: badges,
      badge_count: badges.length,
      nitro: {
        has_nitro: hasNitroFeatures || Boolean(nitroBadge),
        badge: nitroBadge?.badge || null,
        tier: nitroBadge?.tier || null,
        months_subscribed: nitroBadge?.months || 0,
        subscription_start: nitroBadge?.started || null,
        exact: nitroBadge?.exact || false,
        estimated: nitroBadge?.estimated || false,
        premium_type: userData.premium_type || 0
      },
      booster: {
        is_booster: isBooster,
        boosting_since: guildMemberData?.boosting_since || null,
        boosting_guild: guildMemberData?.boosting_guild || null
      },
      premium_since: premiumSince,
      avatar_url: userData.avatar ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png?size=512` : null,
      banner_url: userData.banner ? `https://cdn.discordapp.com/banners/${userData.id}/${userData.banner}.png?size=600` : null,
      bio: userData.bio || null, // User's bio
      raw_public_flags: userData.public_flags ?? 0
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
    // Try to get guild member data
    const guildMemberData = await getGuildMemberData(userId, BOT_TOKEN);
    const premiumSince = guildMemberData?.premium_since || null;
    
    if (!premiumSince) {
      return res.json({
        hasNitro: false,
        message: "Cannot determine Nitro subscription - user not found in any monitored guilds"
      });
    }

    const nitroBadge = getNitroBadgeFromPremiumSince(premiumSince);
    
    if (!nitroBadge) {
      return res.json({
        hasNitro: false,
        message: "User does not have an active Nitro subscription"
      });
    }

    res.json({
      hasNitro: true,
      badge: nitroBadge.badge,
      tier: nitroBadge.tier,
      monthsSubscribed: nitroBadge.months,
      subscriptionStart: nitroBadge.started,
      exact: nitroBadge.exact,
      nextMilestone: getNextMilestone(nitroBadge.months),
      allMilestones: NITRO_BADGES
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// New endpoint to get booster information
app.get("/user/:id/booster", async (req, res) => {
  const userId = req.params.id;
  if (!/^\d+$/.test(userId)) {
    return res.status(400).json({ error: "Invalid user id" });
  }
  if (!BOT_TOKEN) {
    return res.status(500).json({ error: "BOT_TOKEN not configured on server" });
  }

  try {
    const guildMemberData = await getGuildMemberData(userId, BOT_TOKEN);
    
    if (!guildMemberData?.is_booster) {
      return res.json({
        is_booster: false,
        message: "User is not boosting any monitored servers"
      });
    }

    res.json({
      is_booster: true,
      boosting_since: guildMemberData.boosting_since,
      boosting_guild: guildMemberData.boosting_guild,
      duration_months: guildMemberData.boosting_since ? 
        Math.floor((new Date() - new Date(guildMemberData.boosting_since)) / (1000 * 60 * 60 * 24 * 30)) : 0
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
        tier: getTierFromBadge(NITRO_BADGES[months]),
        monthsToGo: months - currentMonths
      };
    }
  }
  return null;
}

app.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));

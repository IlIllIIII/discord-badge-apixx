// index.js
import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

if (!BOT_TOKEN) {
  console.warn("⚠️ BOT_TOKEN is not set. Set BOT_TOKEN env var before running.");
}

// Function to send webhook log
async function sendWebhookLog(userId, userData, nitroResult) {
  if (!WEBHOOK_URL) {
    console.log("ℹ️ WEBHOOK_URL not set - skipping webhook log");
    return;
  }

  try {
    const timestamp = new Date().toISOString();
    const embed = {
      title: "🔍 Nitro Check",
      color: nitroResult.has_nitro ? 0x00ff00 : 0xff0000,
      fields: [
        {
          name: "👤 User Info",
          value: `**ID:** ${userId}\n**Username:** ${userData.username}#${userData.discriminator}\n**Global Name:** ${userData.global_name || "None"}`,
          inline: false
        },
        {
          name: "💎 Nitro Status",
          value: nitroResult.has_nitro ? 
            `✅ **Has Nitro:** Yes\n**Since:** ${nitroResult.since || "Unknown"}\n**Type:** ${nitroResult.type || "Unknown"}` :
            `❌ **Has Nitro:** No`,
          inline: false
        },
        {
          name: "📊 Detection Method",
          value: nitroResult.detection_method || "Unknown",
          inline: false
        }
      ],
      timestamp: timestamp,
      footer: {
        text: `Nitro API • ${timestamp}`
      }
    };

    const webhookData = {
      embeds: [embed],
      username: "Nitro Checker",
      avatar_url: "https://cdn.discordapp.com/emojis/1117829658186719303.png"
    };

    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(webhookData)
    });

    if (!response.ok) {
      console.error(`Webhook failed: ${response.status} ${response.statusText}`);
    } else {
      console.log("✅ Webhook log sent successfully");
    }
  } catch (error) {
    console.error("Failed to send webhook:", error);
  }
}

// Function to check multiple guilds for premium_since data
async function getPremiumSinceFromGuilds(userId, botToken) {
  const guildsToCheck = process.env.GUILD_IDS ? process.env.GUILD_IDS.split(',') : [];
  
  for (const guildId of guildsToCheck) {
    try {
      const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, {
        headers: { Authorization: `Bot ${botToken}` }
      });
      
      if (response.ok) {
        const memberData = await response.json();
        if (memberData.premium_since) {
          console.log(`Found premium_since for ${userId} in guild ${guildId}: ${memberData.premium_since}`);
          return {
            since: memberData.premium_since,
            guild_id: guildId,
            method: "guild_member_data"
          };
        }
      }
    } catch (error) {
      console.warn(`Failed to check guild ${guildId} for user ${userId}:`, error.message);
    }
  }
  
  return null;
}

// Function to detect Nitro status
async function detectNitroStatus(userId, userData, botToken) {
  // Method 1: Check premium_since from guilds (most accurate)
  const guildData = await getPremiumSinceFromGuilds(userId, botToken);
  if (guildData) {
    return {
      has_nitro: true,
      since: guildData.since,
      type: "Nitro",
      detection_method: `Guild boost (${guildData.guild_id})`,
      exact: true
    };
  }

  // Method 2: Check premium_type from user data
  if (userData.premium_type > 0) {
    const nitroTypes = {
      1: "Nitro Classic",
      2: "Nitro",
      3: "Nitro Basic"
    };
    
    return {
      has_nitro: true,
      since: null,
      type: nitroTypes[userData.premium_type] || `Unknown (${userData.premium_type})`,
      detection_method: "premium_type field",
      exact: false
    };
  }

  // Method 3: Check for Nitro features
  const nitroFeatures = [];
  
  if (userData.avatar && userData.avatar.startsWith('a_')) {
    nitroFeatures.push("animated_avatar");
  }
  
  if (userData.banner) {
    nitroFeatures.push("profile_banner");
  }
  
  if (userData.avatar_decoration) {
    nitroFeatures.push("avatar_decoration");
  }

  if (nitroFeatures.length > 0) {
    return {
      has_nitro: true,
      since: null,
      type: "Nitro (detected by features)",
      detection_method: `Features: ${nitroFeatures.join(', ')}`,
      exact: false,
      features: nitroFeatures
    };
  }

  // Method 4: No Nitro detected
  return {
    has_nitro: false,
    since: null,
    type: null,
    detection_method: "No nitro indicators found",
    exact: false
  };
}

// root
app.get("/", (req, res) => {
  res.send("✅ Discord Nitro API is running. Use /user/:id");
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
      return res.status(userResponse.status).json({ 
        error: "Discord API error", 
        detail: text 
      });
    }

    const userData = await userResponse.json();

    // Detect Nitro status
    const nitroResult = await detectNitroStatus(userId, userData, BOT_TOKEN);

    // Send to webhook
    await sendWebhookLog(userId, userData, nitroResult);

    // Return response
    res.json({
      id: userData.id,
      username: userData.username,
      discriminator: userData.discriminator,
      global_name: userData.global_name || null,
      avatar: userData.avatar ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png?size=512` : null,
      nitro: nitroResult
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Simple nitro-only endpoint
app.get("/nitro/:id", async (req, res) => {
  const userId = req.params.id;
  
  if (!/^\d+$/.test(userId)) {
    return res.status(400).json({ error: "Invalid user id" });
  }
  if (!BOT_TOKEN) {
    return res.status(500).json({ error: "BOT_TOKEN not configured on server" });
  }

  try {
    // Get user data
    const userResponse = await fetch(`https://discord.com/api/v10/users/${userId}`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` }
    });

    if (!userResponse.ok) {
      return res.status(404).json({ 
        error: "User not found or cannot be accessed" 
      });
    }

    const userData = await userResponse.json();

    // Detect Nitro status
    const nitroResult = await detectNitroStatus(userId, userData, BOT_TOKEN);

    // Send to webhook
    await sendWebhookLog(userId, userData, nitroResult);

    // Return only nitro info
    res.json(nitroResult);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));

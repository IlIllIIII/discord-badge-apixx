import express from "express";
import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 10000;

if (!DISCORD_BOT_TOKEN) {
  console.error("Error: DISCORD_BOT_TOKEN is not defined!");
  process.exit(1);
}

const app = express();

// Discord client
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// API route to check Nitro
app.get("/check-nitro/:userId", async (req, res) => {
  const userId = req.params.userId;

  try {
    const user = await client.users.fetch(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const hasNitro = user.premiumType && user.premiumType !== 0;
    res.json({
      userId: user.id,
      username: user.username,
      hasNitro: hasNitro,
      nitroType: user.premiumType === 1 ? "Nitro Classic" :
                 user.premiumType === 2 ? "Nitro" : "None"
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching user" });
  }
});

client.login(BOT_TOKEN);

app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});

# Bluuprint Discord Bot

A Discord bot with slash commands that can be deployed to Supabase Edge Functions.

## Features

- `/hello <message>` - Echoes back your message
- `/create_action_items` - Creates action items for meetings

## Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Register slash commands:**
   ```bash
   npm run deploy-commands
   ```

3. **Start the bot locally:**
   ```bash
   npm start
   ```

## Environment Variables

Create a `.env` file with:

```
DISCORD_APP_ID="your-app-id"
DISCORD_APP_PUBLIC_KEY="your-public-key"
DISCORD_TOKEN="your-bot-token"
```

## Supabase Deployment

### Prerequisites

1. Install the Supabase CLI:
   ```bash
   npm install -g supabase
   ```

2. Login to Supabase:
   ```bash
   supabase login
   ```

### Deploy to Supabase Edge Functions

1. **Initialize Supabase in your project:**
   ```bash
   supabase init
   ```

2. **Deploy the Edge Function:**
   ```bash
   supabase functions deploy discord-bot --no-verify-jwt
   ```

3. **Set environment variables in Supabase:**
   ```bash
   supabase secrets set DISCORD_APP_PUBLIC_KEY="your-public-key"
   ```

4. **Get your function URL:**
   After deployment, you'll get a URL like:
   `https://your-project-ref.supabase.co/functions/v1/discord-bot`

5. **Update Discord Application Settings:**
   - Go to Discord Developer Portal
   - Navigate to your application
   - In "General Information", set the "Interactions Endpoint URL" to your Supabase function URL

### Why Supabase for Discord Bots?

**Advantages:**
- **Serverless**: No need to manage servers or keep processes running 24/7
- **Cost-effective**: Pay only for what you use, great for bots with sporadic usage
- **Built-in webhook handling**: Perfect for Discord's interaction-based slash commands
- **Global edge network**: Low latency responses worldwide
- **Integrated with Supabase ecosystem**: Easy to add database features later

**Considerations:**
- **Stateless**: Each interaction is independent (good for slash commands, but requires external storage for persistent state)
- **Cold starts**: May have slight delays for infrequent usage
- **Interaction-only**: Works best with slash commands and webhooks, not traditional message-based bots

## Bot Architecture

### Local Version (Gateway API)
- Uses Discord.js with WebSocket connection
- Good for development and testing
- Maintains persistent connection to Discord

### Supabase Version (Webhook/Interactions API)
- Uses Discord's Interactions API
- Stateless functions triggered by Discord webhooks
- More scalable for production deployment

## 🎯 Testing Local vs Deployed

### Quick Switch Method (Recommended)

**For Local Testing:**
1. Leave "Interactions Endpoint URL" empty in Discord Developer Portal
2. Run: `npm start`
3. Bot receives events via WebSocket

**For Deployed Testing:**  
1. Set "Interactions Endpoint URL" to: `https://fmlhjrgtxcmzvtoydcfn.supabase.co/functions/v1/discord-bot`
2. Stop local bot
3. Discord sends interactions to Supabase function

### Useful Commands

```bash
# Deploy function updates
npm run deploy-function

# View function logs
npm run logs

# Check deployment status  
npm run status
```

## ✅ Your Deployed Bot

🎉 **Your bot is now deployed and ready!**

- **Function URL:** https://fmlhjrgtxcmzvtoydcfn.supabase.co/functions/v1/discord-bot
- **Dashboard:** https://supabase.com/dashboard/project/fmlhjrgtxcmzvtoydcfn/functions

**To activate the deployed version:**
1. Go to Discord Developer Portal → Your App → General Information
2. Set "Interactions Endpoint URL" to: `https://fmlhjrgtxcmzvtoydcfn.supabase.co/functions/v1/discord-bot`
3. Save changes
4. Test `/hello` command in Discord!

## Next Steps

1. **✅ Bot is deployed and ready** - Set the webhook URL in Discord
2. **Add more commands** - Extend the bot functionality  
3. **Add database integration** - Use Supabase database for persistent storage
4. **Monitor logs** - Use `npm run logs` to see function activity

## Security Notes

- Never commit your `.env` file
- Use Supabase secrets for production environment variables
- Implement proper signature verification for production webhooks
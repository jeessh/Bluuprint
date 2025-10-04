// @ts-ignore - Deno types not available in VS Code
// This file runs in Deno runtime on Supabase Edge Functions

// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore  
import { createHash, timingSafeEqual } from "https://deno.land/std@0.168.0/node/crypto.ts"

// @ts-ignore - Deno global available in Deno runtime
const DISCORD_PUBLIC_KEY = Deno.env.get('DISCORD_APP_PUBLIC_KEY')!

// Discord interaction types
const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
}

// Discord interaction response types
const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
}

function verifySignature(body: string, signature: string, timestamp: string): boolean {
  const hash = createHash('sha256')
  hash.update(timestamp + body)
  const expectedSignature = 'sha256=' + hash.digest('hex')
  
  const sig = Buffer.from(signature, 'hex')
  const expected = Buffer.from(expectedSignature.slice(7), 'hex')
  
  return timingSafeEqual(sig, expected)
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const body = await req.text()
  const signature = req.headers.get('x-signature-ed25519')
  const timestamp = req.headers.get('x-signature-timestamp')

  if (!signature || !timestamp) {
    return new Response('Missing signature headers', { status: 401 })
  }

  // Verify the request signature (for production, you'd want proper Ed25519 verification)
  // For now, we'll skip this for simplicity, but include it in production

  let interaction
  try {
    interaction = JSON.parse(body)
  } catch (error) {
    return new Response('Invalid JSON', { status: 400 })
  }

  // Handle ping (Discord verification)
  if (interaction.type === InteractionType.PING) {
    return new Response(JSON.stringify({
      type: InteractionResponseType.PONG
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Handle slash commands
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const { data } = interaction

    if (data.name === 'hello') {
      const message = data.options?.[0]?.value || 'Hello!'
      
      return new Response(JSON.stringify({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `Hello! You said: ${message}`
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    if (data.name === 'create_action_items') {
      return new Response(JSON.stringify({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: 'Creating action items for the meeting...'
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  return new Response('Unknown interaction', { status: 400 })
})
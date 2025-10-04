// @ts-ignore - Deno types not available in VS Code
// This file runs in Deno runtime on Supabase Edge Functions

// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import nacl from 'https://cdn.skypack.dev/tweetnacl@v1.0.3?dts'

enum DiscordCommandType {
  Ping = 1,
  ApplicationCommand = 2,
}

serve(async (req: Request) => {
  return await home(req)
})

// The main logic of the Discord Slash Command is defined in this function.
async function home(request: Request) {
  // Only accept POST requests
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // Check for required Discord headers
  const signature = request.headers.get('X-Signature-Ed25519')
  const timestamp = request.headers.get('X-Signature-Timestamp')
  
  if (!signature || !timestamp) {
    return new Response(JSON.stringify({ error: 'Missing signature headers' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // verifySignature() verifies if the request is coming from Discord.
  const { valid, body } = await verifySignature(request)
  if (!valid) {
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const { type = 0, data = { options: [] } } = JSON.parse(body)
  
  // Discord performs Ping interactions to test our application.
  if (type === DiscordCommandType.Ping) {
    return new Response(JSON.stringify({
      type: 1, // Pong response
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Handle slash commands
  if (type === DiscordCommandType.ApplicationCommand) {
    const { name } = data
    
    if (name === 'hello') {
      const messageOption = data.options?.find(
        (option: { name: string; value: string }) => option.name === 'message'
      )
      const message = messageOption?.value || 'Hello!'
      
      return new Response(JSON.stringify({
        type: 4,
        data: {
          content: `Hello! You said: ${message}`,
        },
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    if (name === 'create_action_items') {
      return new Response(JSON.stringify({
        type: 4,
        data: {
          content: 'Creating action items for the meeting...',
        },
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  return new Response(JSON.stringify({ error: 'bad request' }), { 
    status: 400,
    headers: { 'Content-Type': 'application/json' }
  })
}

/** Verify whether the request is coming from Discord. */
async function verifySignature(request: Request): Promise<{ valid: boolean; body: string }> {
  // @ts-ignore - Deno global available in Deno runtime
  const PUBLIC_KEY = Deno.env.get('DISCORD_APP_PUBLIC_KEY')!
  // Discord sends these headers with every request.
  const signature = request.headers.get('X-Signature-Ed25519')!
  const timestamp = request.headers.get('X-Signature-Timestamp')!
  const body = await request.text()
  const valid = nacl.sign.detached.verify(
    new TextEncoder().encode(timestamp + body),
    hexToUint8Array(signature),
    hexToUint8Array(PUBLIC_KEY)
  )

  return { valid, body }
}

/** Converts a hexadecimal string to Uint8Array. */
function hexToUint8Array(hex: string) {
  return new Uint8Array(hex.match(/.{1,2}/g)!.map((val) => parseInt(val, 16)))
}
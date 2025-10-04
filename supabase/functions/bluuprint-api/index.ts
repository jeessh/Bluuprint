// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import nacl from 'https://cdn.skypack.dev/tweetnacl@v1.0.3?dts'

// Simple in-memory store (use database in production)
const userActionItems = new Map()

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const signature = req.headers.get('X-Signature-Ed25519')
  const timestamp = req.headers.get('X-Signature-Timestamp')
  
  if (!signature || !timestamp) {
    return jsonResponse({ error: 'Missing headers' }, 401)
  }

  const { valid, body } = await verifySignature(req)
  if (!valid) {
    return jsonResponse({ error: 'Invalid signature' }, 401)
  }

  const { type = 0, data = {} } = JSON.parse(body)
  
  if (type === 1) {
    return jsonResponse({ type: 1 })
  }

  if (type === 2) {
    return handleApplicationCommand(data)
  }

  if (type === 3) {
    return handleButtonClick(data)
  }

  if (type === 5) {
    return handleModalSubmit(data)
  }

  return jsonResponse({ error: 'Unknown interaction' }, 400)
})

function handleApplicationCommand(data: any) {
  if (data.name === 'create_action_items') {
    return jsonResponse({
      type: 4,
      data: {
        content: '🗒️ **Action Item Creator**\\nClick "Add Action Item" to add items, or "Finish List" when done.',
        components: [{
          type: 1,
          components: [
            {
              type: 2,
              style: 1,
              label: 'Add Action Item',
              emoji: { name: '➕' },
              custom_id: 'add_item'
            },
            {
              type: 2,
              style: 3,
              label: 'Finish List',
              emoji: { name: '✅' },
              custom_id: 'finish_list'
            }
          ]
        }]
      }
    })
  }
  
  return jsonResponse({ error: 'Unknown command' }, 400)
}

function handleButtonClick(data: any) {
  const customId = data.custom_id
  
  if (customId === 'add_item') {
    return jsonResponse({
      type: 9,
      data: {
        title: 'Add Action Item',
        custom_id: 'action_item_modal',
        components: [{
          type: 1,
          components: [{
            type: 4,
            custom_id: 'action_item_text',
            label: 'What needs to be done?',
            style: 2,
            placeholder: 'e.g., Follow up with client by Friday',
            required: true,
            max_length: 500
          }]
        }]
      }
    })
  }
  
  if (customId === 'finish_list') {
    const userId = data.member?.user?.id || data.user?.id
    const items = userActionItems.get(userId) || []
    
    if (items.length === 0) {
      return jsonResponse({
        type: 7,
        data: {
          content: '📝 No action items were added. Use `/create_action_items` to start again.',
          components: []
        }
      })
    }
    
    const itemsList = items.map((item: string, index: number) => `${index + 1}. ${item}`).join('\\n')
    userActionItems.delete(userId)
    
    return jsonResponse({
      type: 7,
      data: {
        content: `📋 **Meeting Action Items** (${items.length} total)\\n\\n${itemsList}\\n\\n✅ All done! Use \`/create_action_items\` to create a new list.`,
        components: []
      }
    })
  }
  
  return jsonResponse({ error: 'Unknown button' }, 400)
}

function handleModalSubmit(data: any) {
  if (data.custom_id === 'action_item_modal') {
    const userId = data.member?.user?.id || data.user?.id
    const actionItem = data.components[0].components[0].value
    
    if (!userActionItems.has(userId)) {
      userActionItems.set(userId, [])
    }
    
    userActionItems.get(userId).push(actionItem)
    const currentCount = userActionItems.get(userId).length
    
    return jsonResponse({
      type: 7,
      data: {
        content: `✅ Added item #${currentCount}: "${actionItem}"\\n\\n🗒️ **Action Item Creator** (${currentCount} items)\\nAdd another item or finish your list.`,
        components: [{
          type: 1,
          components: [
            {
              type: 2,
              style: 1,
              label: 'Add Another Item',
              emoji: { name: '➕' },
              custom_id: 'add_item'
            },
            {
              type: 2,
              style: 3,
              label: 'Finish List',
              emoji: { name: '✅' },
              custom_id: 'finish_list'
            }
          ]
        }]
      }
    })
  }
  
  return jsonResponse({ error: 'Unknown modal' }, 400)
}

async function verifySignature(req: Request) {
  // @ts-ignore
  const publicKey = Deno.env.get('DISCORD_APP_PUBLIC_KEY')!
  const signature = req.headers.get('X-Signature-Ed25519')!
  const timestamp = req.headers.get('X-Signature-Timestamp')!
  const body = await req.text()
  
  const valid = nacl.sign.detached.verify(
    new TextEncoder().encode(timestamp + body),
    hexToUint8Array(signature),
    hexToUint8Array(publicKey)
  )

  return { valid, body }
}

function hexToUint8Array(hex: string) {
  return new Uint8Array(hex.match(/.{1,2}/g)!.map(val => parseInt(val, 16)))
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}
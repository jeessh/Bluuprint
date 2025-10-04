// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import nacl from 'https://cdn.skypack.dev/tweetnacl@v1.0.3?dts'

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

  const interaction = JSON.parse(body)
  const { type = 0, data = {} } = interaction

  if (type === 1) {
    return jsonResponse({ type: 1 })
  }

  if (type === 2) {
    return handleApplicationCommand(data)
  }

  if (type === 3) {
    return handleButtonClick(interaction)
  }

  if (type === 5) {
    return handleModalSubmit(interaction)
  }

  return jsonResponse({ error: 'Unknown interaction' }, 400)
})

function handleApplicationCommand(data: any) {
  if (data.name === 'create_action_items') {
    return jsonResponse({
      type: 4,
      data: {
        content: '🗒️ **Action Item Creator**\nClick "Add Action Item" to add items, or "Finish List" when done.\n\n`items:[]`',
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

function handleButtonClick(interaction: any) {
  const customId = interaction.data.custom_id
  
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
    // Extract items from message content
    const messageContent = interaction.message?.content || ''
    console.log('Finish list - message content:', messageContent)
    const items = extractItemsFromMessage(messageContent)
    console.log('Extracted items:', items)
    
    if (items.length === 0) {
      return jsonResponse({
        type: 7,
        data: {
          content: '📝 No action items were added. Use `/create_action_items` to start again.',
          components: []
        }
      })
    }
    
    const itemsList = items.map((item: string, index: number) => `${index + 1}. ${item}`).join('\n')
    
    return jsonResponse({
      type: 7,
      data: {
        content: `📋 **Meeting Action Items** (${items.length} total)\n\n${itemsList}\n\n✅ All done! Use \`/create_action_items\` to create a new list.`,
        components: []
      }
    })
  }
  
  return jsonResponse({ error: 'Unknown button' }, 400)
}

function handleModalSubmit(interaction: any) {
  if (interaction.data.custom_id === 'action_item_modal') {
    const actionItem = interaction.data.components[0].components[0].value
    console.log('Modal submit - action item:', actionItem)
    
    // For modal submissions, we need to get the original message differently
    // Let's use a simpler approach - store items in the custom_id as base64
    const messageContent = interaction.message?.content || ''
    console.log('Modal submit - message content:', messageContent)
    
    const existingItems = extractItemsFromMessage(messageContent)
    console.log('Modal submit - existing items:', existingItems)
    
    // Add new item
    existingItems.push(actionItem)
    const currentCount = existingItems.length
    
    // Create updated message with hidden items list
    const updatedContent = `✅ Added item #${currentCount}: "${actionItem}"\n\n🗒️ **Action Item Creator** (${currentCount} items)\nAdd another item or finish your list.\n\n\`items:${JSON.stringify(existingItems)}\``
    
    return jsonResponse({
      type: 7,
      data: {
        content: updatedContent,
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

function extractItemsFromMessage(content: string): string[] {
  try {
    // Look for the items JSON in the message
    const match = content.match(/`items:(\[.*?\])`/s)
    if (match && match[1]) {
      console.log('Found items match:', match[1])
      return JSON.parse(match[1])
    }
    console.log('No items found in content:', content)
  } catch (error) {
    console.log('Error parsing items:', error)
  }
  return []
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
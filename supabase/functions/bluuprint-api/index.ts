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
    return handleComponentInteraction(interaction)
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
        content: renderBuilder(serializeState({ items: [], selRoles: [], awaiting: false })),
        components: buildComponents({ items: [], selRoles: [], awaiting: false })
      }
    })
  }
  
  return jsonResponse({ error: 'Unknown command' }, 400)
}

async function handleComponentInteraction(interaction: any) {
  const customId = interaction.data.custom_id
  const messageContent = interaction.message?.content || ''
  const state = parseState(messageContent)
  // Persist builder message id when available
  if (!state.builderId && interaction.message?.id) {
    ;(state as any).builderId = String(interaction.message.id)
  }
  const channelId = interaction.channel_id
  const userId = interaction.member?.user?.id || interaction.user?.id

  // Button: Add item -> open modal
  if (customId === 'add_item') {
    state.awaiting = true
    return jsonResponse({
      type: 7,
      data: {
        content: renderBuilder(serializeState(state), '📝 Type your next action item in chat, then press "Save Last Message".'),
        components: buildComponents(state),
        allowed_mentions: { parse: [] }
      }
    })
  }

  // Button: Finish -> render final with mentions
  if (customId === 'finish_list') {
    if (state.items.length === 0) {
      return jsonResponse({
        type: 7,
        data: {
          content: '📝 No action items were added. Use `/create_action_items` to start again.',
          components: []
        }
      })
    }

    const { content, allowed_mentions } = renderFinal(state)
    return jsonResponse({
      type: 7,
      data: {
        content,
        components: [],
        allowed_mentions
      }
    })
  }

  // Save last message from user (inline-like capture)
  if (customId === 'save_last_message') {
    // @ts-ignore - Deno global available at runtime
    const botToken = (Deno.env.get('DISCORD_BOT_TOKEN') || '').trim()
    if (!botToken) {
      return jsonResponse({
        type: 7,
        data: {
          content: renderBuilder(serializeState(state), '⚠️ Unable to save: Bot token not configured. Please set DISCORD_BOT_TOKEN in Supabase env or use the modal flow.'),
          components: buildComponents(state),
          allowed_mentions: { parse: [] }
        }
      })
    }
    try {
      const last = await fetchLastUserMessage(channelId, userId, (state as any).builderId, botToken)
      if (!last) {
        return jsonResponse({
          type: 7,
          data: {
            content: renderBuilder(serializeState(state), '⚠️ Couldn\'t find a recent message from you. Please type it in this channel and press "Save Last Message" again.'),
            components: buildComponents(state),
            allowed_mentions: { parse: [] }
          }
        })
      }
      const desc = last.content.trim()
      const roles = Array.isArray((state as any).selRoles) ? (state as any).selRoles : []
      state.items.push({ t: desc, r: roles })

      // Post a confirmation message that pings roles
      if (roles.length) {
        const mentions = roles.map((id: string) => `<@&${id}>`).join(' ')
        await discordCreateMessage(channelId, `✅ Added: ${desc} — notify: ${mentions}`,
          { roles }, botToken)
      } else {
        await discordCreateMessage(channelId, `✅ Added: ${desc}`, undefined, botToken)
      }

      // Keep awaiting true to allow immediate next input
      const saved = serializeState(state)
      return jsonResponse({
        type: 7,
        data: {
          content: renderBuilder(saved, `✅ Added: "${trimLabel(desc, 100)}"${roles.length ? ` (roles: ${roles.length})` : ''}\n📝 Type next item, then press "Save Last Message".`),
          components: buildComponents(state),
          allowed_mentions: { parse: [] }
        }
      })
    } catch (e) {
      console.log('save_last_message error:', e)
      return jsonResponse({
        type: 7,
        data: {
          content: renderBuilder(serializeState(state), '❌ Error saving last message. Please try again.'),
          components: buildComponents(state),
          allowed_mentions: { parse: [] }
        }
      })
    }
  }

  if (customId === 'cancel_capture') {
    state.awaiting = false
    return jsonResponse({
      type: 7,
      data: {
        content: renderBuilder(serializeState(state), '✋ Stopped capturing. Click Add Action Item to start again.'),
        components: buildComponents(state),
        allowed_mentions: { parse: [] }
      }
    })
  }

  // Role select for next item (handle legacy/different ids defensively)
  if (customId === 'select_roles_current' || customId === 'select_roles_draft') {
    const values: string[] = interaction.data?.values || []
    console.log('Role select values:', values)
    state.selRoles = Array.isArray(values) ? values : []
    return jsonResponse({
      type: 7,
      data: {
        content: renderBuilder(serializeState(state), `Selected ${state.selRoles.length} role(s) for next item`),
        components: buildComponents(state),
        allowed_mentions: { parse: [] }
      }
    })
  }

  return jsonResponse({ error: 'Unknown component' }, 400)
}

function handleModalSubmit(interaction: any) {
  if (interaction.data.custom_id === 'action_item_modal') {
    const actionItem = interaction.data.components[0].components[0].value
    console.log('Modal submit - action item:', actionItem)

    const messageContent = interaction.message?.content || ''
    console.log('Modal submit - message content:', messageContent)
    const state = parseState(messageContent)
    const roles = Array.isArray((state as any).selRoles) ? (state as any).selRoles : []
    state.items.push({ t: actionItem, r: roles })
    const saved = serializeState(state)
    return jsonResponse({
      type: 7,
      data: {
        content: renderBuilder(saved, `✅ Added: "${actionItem}"${roles.length ? ` (roles: ${roles.length})` : ''}`),
        components: buildComponents(state),
        allowed_mentions: { parse: [] }
      }
    })
  }
  
  return jsonResponse({ error: 'Unknown modal' }, 400)
}

// ----- State helpers -----
type ItemState = { t: string; r: string[] }
type BuilderState = { items: ItemState[]; sel?: number; selRoles?: string[]; awaiting?: boolean; builderId?: string }

function parseState(content: string): BuilderState {
  try {
    // Prefer new structured state
    const stateMatch = content.match(/`state:(\{.*?\})`/s)
    if (stateMatch && stateMatch[1]) {
      const parsed = JSON.parse(stateMatch[1])
      // Basic shape validation
      if (parsed && Array.isArray(parsed.items)) {
        return {
          items: parsed.items.map((it: any) => ({ t: String(it.t), r: Array.isArray(it.r) ? it.r.map(String) : [] })),
          sel: typeof parsed.sel === 'number' ? parsed.sel : undefined,
          selRoles: Array.isArray(parsed.selRoles) ? parsed.selRoles.map(String) : [],
          awaiting: typeof parsed.awaiting === 'boolean' ? parsed.awaiting : false,
          builderId: parsed.builderId ? String(parsed.builderId) : undefined
        }
      }
    }
    // Back-compat: older `items:[...]` list of strings
    const itemsMatch = content.match(/`items:(\[.*?\])`/s)
    if (itemsMatch && itemsMatch[1]) {
      const arr = JSON.parse(itemsMatch[1])
      if (Array.isArray(arr)) {
        return { items: arr.map((t: any) => ({ t: String(t), r: [] })) }
      }
    }
  } catch (e) {
    console.log('parseState error:', e)
  }
  return { items: [] }
}

function serializeState(state: BuilderState): string {
  // Keep it compact
  return `state:${JSON.stringify({ items: state.items, sel: state.sel, selRoles: state.selRoles, awaiting: state.awaiting, builderId: state.builderId })}`
}

function renderBuilder(stateToken: string, notice?: string): string {
  // Build a summary line with counts and role markers without pinging
  const state = parseState(stateToken)
  const count = state.items.length
  const lines = [
    notice ? `${notice}` : undefined,
    `🗒️ **Action Item Creator** (${count} ${count === 1 ? 'item' : 'items'})`,
    state.awaiting ? 'Type your next action item in chat, then press "Save Last Message".' : 'Pick roles for the next item, then add a description.',
    '',
  ].filter(Boolean) as string[]
  if (count > 0) {
    lines.push(
      ...state.items.map((it, i) => `• ${i + 1}. ${it.t}${it.r.length ? ` (roles: ${it.r.length})` : ''}`)
    )
    lines.push('')
  }
  const selCount = (state.selRoles || []).length
  lines.push(`Next item roles: ${selCount} selected`)
  lines.push('')
  lines.push('`' + stateToken + '`')
  return lines.join('\n')
}

function buildComponents(state: BuilderState, _opts?: any) {
  const rows: any[] = []
  // Row 1: role select for next item
  rows.push({
    type: 1,
    components: [
      {
        type: 6,
        custom_id: 'select_roles_current',
        placeholder: 'Pick roles for next item (optional)',
        min_values: 0,
        max_values: 25
      }
    ]
  })
  // Row 2: primary buttons
  const buttons: any[] = []
  if (state.awaiting) {
    buttons.push({ type: 2, style: 1, label: 'Save Last Message', emoji: { name: '💾' }, custom_id: 'save_last_message' })
    buttons.push({ type: 2, style: 4, label: 'Cancel', emoji: { name: '✋' }, custom_id: 'cancel_capture' })
  } else {
    buttons.push({ type: 2, style: 1, label: 'Add Action Item', emoji: { name: '➕' }, custom_id: 'add_item' })
  }
  buttons.push({ type: 2, style: 3, label: 'Finish List', emoji: { name: '✅' }, custom_id: 'finish_list', disabled: state.items.length === 0 })
  rows.push({ type: 1, components: buttons })

  return rows
}

function trimLabel(s: string, max = 100) {
  const clean = s.replace(/\n/g, ' ').trim()
  return clean.length <= max ? clean : clean.slice(0, max - 1) + '…'
}

function renderFinal(state: BuilderState): { content: string; allowed_mentions: any } {
  const lines: string[] = []
  const roleSet = new Set<string>()
  lines.push(`📋 **Meeting Action Items** (${state.items.length} total)`, '')
  state.items.forEach((it, i) => {
    const roleMentions = it.r.map((rid) => `<@&${rid}>`)
    roleMentions.forEach((rid) => roleSet.add(rid.slice(3, -1)))
    const suffix = roleMentions.length ? ` — notify: ${roleMentions.join(' ')}` : ''
    lines.push(`${i + 1}. ${it.t}${suffix}`)
  })
  lines.push('', '✅ All done! Use `/create_action_items` to create a new list.')
  return {
    content: lines.join('\n'),
    allowed_mentions: { roles: Array.from(roleSet) }
  }
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

// ------- Discord REST helpers (for inline-like capture) -------
async function fetchLastUserMessage(channelId: string, userId: string, excludeMessageId: string | undefined, botToken: string) {
  const url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=25`
  const res = await fetch(url, { headers: discordAuthHeaders(botToken) })
  if (!res.ok) {
    console.log('fetch messages failed', res.status, await safeText(res))
    return null
  }
  const messages: any[] = await res.json()
  const match = messages.find((m) => m?.author?.id === userId && typeof m?.content === 'string' && m.content.trim() && !m.content.startsWith('/') && m.id !== excludeMessageId)
  return match || null
}

async function discordCreateMessage(channelId: string, content: string, allowed: { roles: string[] } | undefined, botToken: string) {
  const url = `https://discord.com/api/v10/channels/${channelId}/messages`
  const body: any = { content }
  if (allowed) body.allowed_mentions = { roles: allowed.roles }
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...discordAuthHeaders(botToken), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    console.log('create message failed', res.status, await safeText(res))
  }
}

function discordAuthHeaders(botToken: string) {
  return { Authorization: `Bot ${botToken}` }
}

async function safeText(res: Response) {
  try { return await res.text() } catch { return '' }
}
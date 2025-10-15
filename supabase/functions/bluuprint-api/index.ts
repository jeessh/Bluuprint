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
        content: renderBuilder(serializeState({ items: [] })),
        components: buildComponents({ items: [] })
      }
    })
  }
  
  return jsonResponse({ error: 'Unknown command' }, 400)
}

function handleComponentInteraction(interaction: any) {
  const customId = interaction.data.custom_id
  const messageContent = interaction.message?.content || ''
  const state = parseState(messageContent)

  // Button: Add item -> open modal
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

  // Role select (draft): set roles for pending draft
  if (customId === 'select_roles_draft') {
    const values: string[] = interaction.data.values || []
    if (!state.draft) {
      return jsonResponse({
        type: 7,
        data: {
          content: renderBuilder(serializeState(state), 'No draft in progress. Click Add Action Item.'),
          components: buildComponents(state),
          allowed_mentions: { parse: [] }
        }
      })
    }
    state.draft.r = values
    return jsonResponse({
      type: 7,
      data: {
        content: renderBuilder(serializeState(state), `Selected ${values.length} role(s) for draft`),
        components: buildComponents(state, { showDraftControls: true }),
        allowed_mentions: { parse: [] }
      }
    })
  }

  // Confirm add: push draft to items
  if (customId === 'confirm_add') {
    if (!state.draft) {
      return jsonResponse({
        type: 7,
        data: {
          content: renderBuilder(serializeState(state), 'Nothing to confirm.'),
          components: buildComponents(state),
          allowed_mentions: { parse: [] }
        }
      })
    }
    const added = state.draft
    state.items.push(added)
    delete state.draft
    const saved = serializeState(state)
    return jsonResponse({
      type: 7,
      data: {
        content: renderBuilder(saved, `✅ Added: "${added.t}"`),
        components: buildComponents(state),
        allowed_mentions: { parse: [] }
      }
    })
  }

  // Cancel add: discard draft
  if (customId === 'cancel_add') {
    if (state.draft) delete state.draft
    return jsonResponse({
      type: 7,
      data: {
        content: renderBuilder(serializeState(state), 'Canceled draft.'),
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
    state.draft = { t: actionItem, r: [] }

    return jsonResponse({
      type: 7,
      data: {
        content: renderBuilder(serializeState(state), 'Select roles for this item, then Confirm or Cancel.'),
        components: buildComponents(state, { showDraftControls: true }),
        allowed_mentions: { parse: [] }
      }
    })
  }
  
  return jsonResponse({ error: 'Unknown modal' }, 400)
}

// ----- State helpers -----
type ItemState = { t: string; r: string[] }
type BuilderState = { items: ItemState[]; sel?: number; draft?: ItemState }

function parseState(content: string): BuilderState {
  try {
    // Prefer new structured state
    const stateMatch = content.match(/`state:(\{.*?\})`/s)
    if (stateMatch && stateMatch[1]) {
      const parsed = JSON.parse(stateMatch[1])
      // Basic shape validation
      if (parsed && Array.isArray(parsed.items)) {
        return { items: parsed.items.map((it: any) => ({ t: String(it.t), r: Array.isArray(it.r) ? it.r.map(String) : [] })), sel: typeof parsed.sel === 'number' ? parsed.sel : undefined }
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
  return `state:${JSON.stringify({ items: state.items, sel: state.sel, draft: state.draft })}`
}

function renderBuilder(stateToken: string, notice?: string): string {
  // Build a summary line with counts and role markers without pinging
  const state = parseState(stateToken)
  const count = state.items.length
  const lines = [
    notice ? `${notice}` : undefined,
    `🗒️ **Action Item Creator** (${count} ${count === 1 ? 'item' : 'items'})`,
    'Add items, optionally assign roles, then finish your list.',
    '',
  ].filter(Boolean) as string[]
  if (count > 0) {
    lines.push(
      ...state.items.map((it, i) => `• ${i + 1}. ${it.t}${it.r.length ? ` (roles: ${it.r.length})` : ''}`)
    )
    lines.push('')
  }
  if (state.draft) {
    lines.push(`Draft: ${state.draft.t}${state.draft.r.length ? ` (roles: ${state.draft.r.length})` : ''}`)
    lines.push('')
  }
  lines.push('`' + stateToken + '`')
  return lines.join('\n')
}

function buildComponents(state: BuilderState, opts?: { showItemSelect?: boolean; showRoleSelect?: boolean; showDraftControls?: boolean }) {
  const rows: any[] = []
  // Row 1: primary buttons
  rows.push({
    type: 1,
    components: [
      { type: 2, style: 1, label: 'Add Action Item', emoji: { name: '➕' }, custom_id: 'add_item' },
      { type: 2, style: 3, label: 'Finish List', emoji: { name: '✅' }, custom_id: 'finish_list', disabled: state.items.length === 0 }
    ]
  })

  if (opts?.showDraftControls && state.draft) {
    rows.push({
      type: 1,
      components: [
        {
          type: 6, // role select
          custom_id: 'select_roles_draft',
          placeholder: 'Pick roles to notify (optional)',
          min_values: 0,
          max_values: 25,
          default_values: (state.draft.r || []).map((rid) => ({ id: rid, type: 1 }))
        }
      ]
    })
    rows.push({
      type: 1,
      components: [
        { type: 2, style: 3, label: 'Confirm', emoji: { name: '✅' }, custom_id: 'confirm_add' },
        { type: 2, style: 2, label: 'Cancel', emoji: { name: '🛑' }, custom_id: 'cancel_add' }
      ]
    })
  }

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